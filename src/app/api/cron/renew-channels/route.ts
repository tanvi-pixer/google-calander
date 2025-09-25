import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { createCalendarClient } from "@/lib/google";
import { v4 as uuid } from "uuid";

export async function GET(request: NextRequest) {
	try {
		console.log("🔄 Starting channel renewal check...");

		const Channels = await getCollection("WatchChannel");
		const Users = await getCollection("Users");

		// Find channels expiring in next 24 hours
		const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
		const expiringChannels = await Channels.find({
			status: "active",
			expirationMs: { $lt: tomorrow, $gt: Date.now() },
		}).toArray();

		console.log(`Found ${expiringChannels.length} channels to renew`);

		for (const channel of expiringChannels) {
			try {
				// Get user's Google credentials
				const user = await Users.findOne({ _id: channel.userId });
				if (!user?.Details?.Google?.RefreshToken) {
					console.log(`❌ No Google credentials for user ${channel.userId}`);
					continue;
				}

				const calendar = createCalendarClient(user.Details.Google);

				// Stop old channel
				await calendar.channels.stop({
					requestBody: {
						id: channel.channelId,
						resourceId: channel.resourceId,
					},
				});

				// Create new channel
				const newChannelId = uuid();
				const watchResponse = await calendar.events.watch({
					calendarId: channel.calendarId,
					requestBody: {
						id: newChannelId,
						type: "web_hook",
						address: process.env.WEBHOOK_ADDRESS!,
						token: channel.token,
					},
				});

				// Update database with new channel info
				await Channels.updateOne(
					{ _id: channel._id },
					{
						$set: {
							channelId: newChannelId,
							resourceId: watchResponse.data.resourceId,
							expirationMs: Number(watchResponse.data.expiration),
							renewedAt: new Date(),
						},
					}
				);

				console.log(`✅ Renewed channel for calendar ${channel.calendarId}`);
			} catch (renewError: any) {
				console.error(
					`❌ Failed to renew channel ${channel.channelId}:`,
					renewError
				);

				// Mark channel as failed
				await Channels.updateOne(
					{ _id: channel._id },
					{ $set: { status: "renewal_failed", error: renewError.message } }
				);
			}
		}

		return NextResponse.json({
			success: true,
			message: `Processed ${expiringChannels.length} channels`,
			renewed: expiringChannels.length,
		});
	} catch (error: any) {
		console.error("Channel renewal error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
