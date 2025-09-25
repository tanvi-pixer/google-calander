import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth"; // Import auth function

export async function GET(request: NextRequest) {
	try {
		// ✅ FIXED: Get the authenticated user instead of random ID
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

		const userId = authenticatedUser.id; // Use real user ID

		console.log("🔍 Debug view-data:");
		console.log("- Authenticated user:", authenticatedUser);
		console.log("- Using user ID:", userId);

		// Get synced calendars
		const Calendars = await getCollection("Calendar");
		const calendars = await Calendars.find({ userId }).toArray();

		console.log("- Found calendars:", calendars.length);

		// Get events count per calendar
		const Events = await getCollection("Events");
		const eventStats = [];

		for (const calendar of calendars) {
			const eventCount = await Events.countDocuments({
				userId,
				calendarId: calendar.calendarId,
			});
			eventStats.push({
				calendarId: calendar.calendarId,
				summary: calendar.summary || "Unknown Calendar",
				eventCount,
			});
		}

		// Get recent events (last 10)
		const recentEvents = await Events.find({ userId })
			.sort({ lastSynced: -1 })
			.limit(10)
			.toArray();

		// Get sync state
		const SyncState = await getCollection("CalendarSyncState");
		const syncStates = await SyncState.find({ userId }).toArray();

		const totalEvents = await Events.countDocuments({ userId });

		console.log("- Total events found:", totalEvents);
		console.log("- Recent events found:", recentEvents.length);

		return NextResponse.json({
			success: true,
			data: {
				calendarsCount: calendars.length,
				calendars: eventStats,
				totalEvents,
				recentEvents: recentEvents.map((event) => ({
					summary: event.summary,
					start: event.start,
					calendarId: event.calendarId,
				})),
				syncStates: syncStates.map((state) => ({
					calendarId: state.calendarId,
					lastSyncedAt: state.lastSyncedAt,
					hasSyncToken: !!state.syncToken,
				})),
			},
		});
	} catch (error: any) {
		console.error("View data error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
