import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";
import { getUserFromRequest } from "@/lib/auth";

function signState(payload: object) {
	const secret = process.env.OAUTH_STATE_SECRET!;
	if (!secret) throw new Error("OAUTH_STATE_SECRET not set");

	const data = Buffer.from(JSON.stringify(payload)).toString("hex");
	const sig = crypto.createHmac("sha256", secret).update(data).digest("hex");
	return `${data}.${sig}`;
}

export async function GET(request: NextRequest) {
	try {
		// Get authenticated user
		const user = await getUserFromRequest(request);
		if (!user) {
			return NextResponse.json(
				{
					success: false,
					message: "Please login first",
				},
				{ status: 401 }
			);
		}

		const state = signState({
			userId: user.id,
			nonce: crypto.randomBytes(16).toString("hex"),
			ts: Date.now(),
		});

		const oauth2 = new google.auth.OAuth2(
			process.env.GOOGLE_CLIENT_ID!,
			process.env.GOOGLE_CLIENT_SECRET!,
			process.env.GOOGLE_REDIRECT_URI!
		);

		const url = oauth2.generateAuthUrl({
			access_type: "offline",
			prompt: "consent",
			include_granted_scopes: true,
			scope: [
				"https://www.googleapis.com/auth/calendar",
				"https://www.googleapis.com/auth/userinfo.email",
				"https://www.googleapis.com/auth/userinfo.profile",
			],
			state,
		});

		return NextResponse.redirect(url);
	} catch (error: any) {
		return NextResponse.json(
			{
				success: false,
				message: "Failed to start OAuth flow",
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
