import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createCalendarClient } from "@/lib/google";

export async function POST(request: NextRequest) {
	try {
		console.log("🔔 Google Calendar webhook received");

		// ✅ STEP 1: Validate webhook headers (as per Google docs)
		const channelId = request.headers.get("x-goog-channel-id");
		const channelToken = request.headers.get("x-goog-channel-token");
		const resourceState = request.headers.get("x-goog-resource-state");
		const resourceId = request.headers.get("x-goog-resource-id");
		const messageNumber = request.headers.get("x-goog-message-number");

		console.log("Webhook headers:", {
			channelId,
			channelToken,
			resourceState,
			resourceId,
			messageNumber,
		});

		if (!channelId || !resourceState) {
			console.log("❌ Missing required webhook headers");
			return NextResponse.json(
				{ success: false, error: "Invalid headers" },
				{ status: 400 }
			);
		}

		// ✅ STEP 2: Handle sync message (initial setup notification)
		if (resourceState === "sync") {
			console.log("✅ Sync message received - channel setup confirmed");
			return NextResponse.json({ success: true, message: "Sync acknowledged" });
		}

		// ✅ STEP 3: Find the watch channel in database
		const Channels = await getCollection("WatchChannel");
		const channel = await Channels.findOne({ channelId });

		if (!channel) {
			console.log("❌ Unknown channel ID:", channelId);
			return NextResponse.json(
				{ success: false, error: "Unknown channel" },
				{ status: 404 }
			);
		}

		// ✅ STEP 4: Validate channel token (security check)
		if (channelToken !== channel.token) {
			console.log("❌ Invalid channel token");
			return NextResponse.json(
				{ success: false, error: "Invalid token" },
				{ status: 403 }
			);
		}

		const { userId, calendarId } = channel;
		console.log(
			`📅 Processing changes for user ${userId}, calendar ${calendarId}`
		);

		// ✅ STEP 5: Get user's Google credentials
		const Users = await getCollection("Users");
		const user = await Users.findOne({ _id: userId });

		if (!user?.Details?.Google?.RefreshToken) {
			console.log("❌ User Google credentials not found");
			return NextResponse.json(
				{ success: false, error: "User not found" },
				{ status: 404 }
			);
		}

		// ✅ STEP 6: Handle resource deletion
		if (resourceState === "not_exists") {
			console.log("🗑️ Resource deleted - cleaning up database");

			// Remove all events for this calendar
			const Events = await getCollection("Events");
			await Events.deleteMany({ userId, calendarId });

			// Mark calendar as deleted
			const Calendars = await getCollection("Calendar");
			await Calendars.updateOne(
				{ userId, calendarId },
				{ $set: { deleted: true, deletedAt: new Date() } }
			);

			return NextResponse.json({
				success: true,
				message: "Resource deletion processed",
			});
		}

		// ✅ STEP 7: Handle resource changes (exists state)
		if (resourceState === "exists") {
			console.log("🔄 Resource changed - performing incremental sync");

			try {
				const calendar = createCalendarClient(user.Details.Google);

				// Get stored sync token for incremental sync
				const SyncState = await getCollection("CalendarSyncState");
				const syncState = await SyncState.findOne({ userId, calendarId });
				const storedSyncToken = syncState?.syncToken;

				console.log(
					"Using syncToken:",
					storedSyncToken ? "Found" : "Not found - full sync"
				);

				let allChangedEvents: any[] = [];
				let pageToken: string | undefined;
				let newSyncToken: string | undefined;

				// Fetch changed events using syncToken
				do {
					const listParams: any = {
						calendarId,
						singleEvents: true,
						pageToken,
					};

					// Use syncToken for incremental sync, or full sync if no token
					if (storedSyncToken) {
						listParams.syncToken = storedSyncToken;
					} else {
						listParams.orderBy = "startTime";
						listParams.maxResults = 2500;
					}

					const response = await calendar.events.list(listParams);

					if (response.data.items) {
						allChangedEvents.push(...response.data.items);
					}

					pageToken = response.data.nextPageToken || undefined;

					// Get new syncToken from last page
					if (!pageToken) {
						newSyncToken = response.data.nextSyncToken || undefined;
					}
				} while (pageToken);

				console.log(`📊 Found ${allChangedEvents.length} changed events`);

				// ✅ STEP 8: Update database with changed events
				const Events = await getCollection("Events");
				let updatedCount = 0;
				let deletedCount = 0;

				for (const event of allChangedEvents) {
					if (event.status === "cancelled") {
						// Event was deleted
						await Events.deleteOne({ eventId: event.id, calendarId });
						deletedCount++;
						console.log(`🗑️ Deleted event: ${event.id}`);
					} else {
						// Event was created or updated
						await Events.updateOne(
							{ eventId: event.id, calendarId },
							{
								$set: {
									userId,
									calendarId,
									eventId: event.id,
									summary: event.summary || "No Title",
									description: event.description || "",
									start: event.start,
									end: event.end,
									status: event.status,
									created: event.created,
									updated: event.updated,
									organizer: event.organizer,
									attendees: event.attendees || [],
									lastSynced: new Date(),
									syncedViaWebhook: true,
								},
							},
							{ upsert: true }
						);
						updatedCount++;
						console.log(`✅ Updated event: ${event.summary} (${event.id})`);
					}
				}

				// ✅ STEP 9: Store new syncToken for next incremental sync
				if (newSyncToken) {
					await SyncState.updateOne(
						{ userId, calendarId },
						{
							$set: {
								syncToken: newSyncToken,
								lastSyncedAt: new Date(),
								lastWebhookSync: new Date(),
								webhookMessageNumber: messageNumber
									? parseInt(messageNumber)
									: undefined,
							},
						},
						{ upsert: true }
					);
					console.log("💾 Stored new syncToken for future incremental syncs");
				}

				console.log(
					`✅ Webhook sync completed: ${updatedCount} updated, ${deletedCount} deleted`
				);

				return NextResponse.json({
					success: true,
					message: "Incremental sync completed",
					stats: {
						totalChanges: allChangedEvents.length,
						updated: updatedCount,
						deleted: deletedCount,
						syncTokenUpdated: !!newSyncToken,
					},
				});
			} catch (syncError: any) {
				console.error("❌ Sync error:", syncError);

				// ✅ STEP 10: Handle "token invalid" fallbacks (410 error)
				if (syncError.code === 410) {
					console.log(
						"🔄 SyncToken expired - performing full re-sync fallback"
					);

					// Clear invalid syncToken
					const SyncState = await getCollection("CalendarSyncState");
					await SyncState.deleteOne({ userId, calendarId });

					// Trigger full re-sync by calling this function again
					// (This time without syncToken, so it will do full sync)
					console.log("🔄 Retrying with full sync...");

					// Recursive call for full sync
					return await handleFullResync(
						userId,
						calendarId,
						user.Details.Google
					);
				} else if (syncError.code === 404) {
					console.log("❌ Calendar not found - marking as deleted");

					// Calendar was deleted or access revoked
					await Channels.updateOne(
						{ _id: channel._id },
						{ $set: { status: "calendar_not_found", error: syncError.message } }
					);
				} else if (syncError.code === 401) {
					console.log("❌ Access token expired - credentials need refresh");
					// createCalendarClient should handle token refresh automatically
				} else {
					console.error("❌ Unhandled sync error:", syncError);
				}

				return NextResponse.json(
					{
						success: false,
						error: "Sync failed",
						details: syncError.message,
					},
					{ status: 500 }
				);
			}
		}

		console.log("⚠️ Unknown resource state:", resourceState);
		return NextResponse.json({
			success: true,
			message: "Unknown state processed",
		});
	} catch (error: any) {
		console.error("❌ Webhook processing error:", error);
		return NextResponse.json(
			{
				success: false,
				error: "Webhook processing failed",
				details: error.message,
			},
			{ status: 500 }
		);
	}
}

// ✅ Helper function for full re-sync fallback
async function handleFullResync(
	userId: string,
	calendarId: string,
	googleCredentials: any
) {
	try {
		console.log("🔄 Starting full re-sync fallback...");

		const calendar = createCalendarClient(googleCredentials);

		let allEvents: any[] = [];
		let pageToken: string | undefined;
		let newSyncToken: string | undefined;

		// Full sync without syncToken
		do {
			const response = await calendar.events.list({
				calendarId,
				singleEvents: true,
				orderBy: "startTime",
				maxResults: 2500,
				pageToken,
			});

			if (response.data.items) {
				allEvents.push(...response.data.items);
			}

			pageToken = response.data.nextPageToken || undefined;

			if (!pageToken) {
				newSyncToken = response.data.nextSyncToken || undefined;
			}
		} while (pageToken);

		// Replace all events for this calendar
		const Events = await getCollection("Events");
		await Events.deleteMany({ userId, calendarId });

		for (const event of allEvents) {
			await Events.updateOne(
				{ eventId: event.id, calendarId },
				{
					$set: {
						userId,
						calendarId,
						eventId: event.id,
						summary: event.summary || "No Title",
						description: event.description || "",
						start: event.start,
						end: event.end,
						status: event.status,
						created: event.created,
						updated: event.updated,
						organizer: event.organizer,
						attendees: event.attendees || [],
						lastSynced: new Date(),
						syncedViaFallback: true,
					},
				},
				{ upsert: true }
			);
		}

		// Store new syncToken
		if (newSyncToken) {
			const SyncState = await getCollection("CalendarSyncState");
			await SyncState.updateOne(
				{ userId, calendarId },
				{
					$set: {
						syncToken: newSyncToken,
						lastSyncedAt: new Date(),
						lastFallbackSync: new Date(),
					},
				},
				{ upsert: true }
			);
		}

		console.log(`✅ Full re-sync completed: ${allEvents.length} events`);

		return NextResponse.json({
			success: true,
			message: "Full re-sync fallback completed",
			stats: {
				totalEvents: allEvents.length,
				syncTokenUpdated: !!newSyncToken,
			},
		});
	} catch (fallbackError: any) {
		console.error("❌ Full re-sync fallback failed:", fallbackError);
		return NextResponse.json(
			{
				success: false,
				error: "Full re-sync failed",
				details: fallbackError.message,
			},
			{ status: 500 }
		);
	}
}

// Handle GET requests (for webhook verification during development)
export async function GET(request: NextRequest) {
	return NextResponse.json({
		success: true,
		message: "Google Calendar Webhook endpoint is active",
		timestamp: new Date().toISOString(),
	});
}
