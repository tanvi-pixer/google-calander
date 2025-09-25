import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createCalendarClient } from "@/lib/google";
import { getUserFromRequest } from "@/lib/auth"; // Import the auth function

export async function POST(request: NextRequest) {
	try {
		const { calendarIds } = await request.json();

		if (!calendarIds || !Array.isArray(calendarIds)) {
			return NextResponse.json(
				{
					success: false,
					message: "calendarIds array is required",
				},
				{ status: 400 }
			);
		}

		// ✅ FIXED: Get the authenticated user instead of generating random ID
		const authenticatedUser = await getUserFromRequest(request);
		if (!authenticatedUser) {
			return NextResponse.json(
				{
					success: false,
					message: "Please login first",
				},
				{ status: 401 }
			);
		}

		const userId = authenticatedUser.id; // Use the real user ID

		// Get user's tokens
		const Users = await getCollection("Users");
		const user = await Users.findOne({ _id: userId as any });

		console.log("🔍 Debug sync-selected:");
		console.log("- Authenticated user:", authenticatedUser);
		console.log("- Looking for user ID:", userId);
		console.log("- User found in DB:", !!user);
		console.log("- Has Google connection:", !!user?.Details?.Google);
		console.log("- Has refresh token:", !!user?.Details?.Google?.RefreshToken);

		if (!user?.Details?.Google?.RefreshToken) {
			return NextResponse.json(
				{
					success: false,
					message: "Google not connected. Please connect first.",
					debug: {
						userFound: !!user,
						hasGoogleDetails: !!user?.Details?.Google,
						hasRefreshToken: !!user?.Details?.Google?.RefreshToken,
					},
				},
				{ status: 400 }
			);
		}

		const calendar = createCalendarClient(user.Details.Google);
		const syncResults = [];

		// Sync each selected calendar
		for (const calendarId of calendarIds) {
			try {
				console.log(`Starting sync for calendar: ${calendarId}`);

				// Mark calendar as selected
				const Calendars = await getCollection("Calendar");
				await Calendars.updateOne(
					{ userId, calendarId },
					{
						$set: {
							userId,
							calendarId,
							selected: true,
							syncStartedAt: new Date(),
						},
					},
					{ upsert: true }
				);

				let allEvents: any[] = [];
				let pageToken: string | undefined;
				let nextSyncToken: string | undefined;

				// Full sync - get all events
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

					// nextSyncToken only on last page
					if (!pageToken) {
						nextSyncToken = response.data.nextSyncToken || undefined;
					}
				} while (pageToken);

				// Store events in database
				const Events = await getCollection("Events");
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
							},
						},
						{ upsert: true }
					);
				}

				// Store sync token for incremental updates
				if (nextSyncToken) {
					const SyncState = await getCollection("CalendarSyncState");
					await SyncState.updateOne(
						{ userId, calendarId },
						{
							$set: {
								syncToken: nextSyncToken,
								lastSyncedAt: new Date(),
								totalEvents: allEvents.length,
							},
						},
						{ upsert: true }
					);
				}

				syncResults.push({
					calendarId,
					success: true,
					eventsCount: allEvents.length,
					syncToken: nextSyncToken ? "Stored" : "Not available",
				});

				console.log(
					`✅ Synced ${allEvents.length} events from calendar: ${calendarId}`
				);
			} catch (calendarError: any) {
				console.error(
					`❌ Sync failed for calendar ${calendarId}:`,
					calendarError
				);
				syncResults.push({
					calendarId,
					success: false,
					error: calendarError.message,
				});
			}
		}

		return NextResponse.json({
			success: true,
			message: `Sync completed for ${calendarIds.length} calendars`,
			results: syncResults,
			totalCalendars: calendarIds.length,
			successfulSyncs: syncResults.filter((r) => r.success).length,
		});
	} catch (error: any) {
		console.error("Sync selected calendars error:", error);
		return NextResponse.json(
			{
				success: false,
				message: "Failed to sync selected calendars",
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
