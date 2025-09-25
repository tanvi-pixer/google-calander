import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createCalendarClient } from "@/lib/google";
import { v4 as uuid } from "uuid";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
	try {
		const { calendarId } = await request.json();

		if (!calendarId) {
			return NextResponse.json(
				{
					success: false,
					message: "calendarId is required",
				},
				{ status: 400 }
			);
		}

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
		const userId = authenticatedUser.id;

		// Get user's tokens
		const Users = await getCollection("Users");
		const user = await Users.findOne({ _id: userId as any });

		if (!user?.Details?.Google?.RefreshToken) {
			return NextResponse.json(
				{
					success: false,
					message: "Google not connected. Please connect first.",
				},
				{ status: 400 }
			);
		}

		const calendar = createCalendarClient(user.Details.Google);

		const channelId = uuid();
		const token = `u=${userId}&c=${calendarId}`; // For routing webhooks

		try {
			// Create watch channel
			const watchResponse = await calendar.events.watch({
				calendarId,
				requestBody: {
					id: channelId,
					type: "web_hook",
					address: process.env.WEBHOOK_ADDRESS!, // Your public HTTPS URL
					token,
					params: {
						ttl: "604800", // 7 days in seconds
					},
				},
			});

			// Store channel metadata
			const Channels = await getCollection("WatchChannel");
			await Channels.insertOne({
				userId,
				calendarId,
				channelId,
				resourceId: watchResponse.data.resourceId,
				resourceUri: watchResponse.data.resourceUri,
				token,
				expirationMs: watchResponse.data.expiration
					? Number(watchResponse.data.expiration)
					: null,
				status: "active",
				createdAt: new Date(),
			});

			return NextResponse.json({
				success: true,
				message: `Watch channel created for calendar ${calendarId}`,
				channelId,
				expiration: watchResponse.data.expiration,
			});
		} catch (watchError: any) {
			// Watch setup might fail for localhost - that's OK for testing
			console.error("Watch setup failed:", watchError.message);
			return NextResponse.json({
				success: false,
				message: `Watch setup failed: ${watchError.message}. This is normal for localhost testing.`,
				note: "Watch channels require a public HTTPS URL. Use ngrok for testing webhooks.",
			});
		}
	} catch (error: any) {
		console.error("Setup watch error:", error);
		return NextResponse.json(
			{
				success: false,
				message: "Failed to setup watch channel",
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
