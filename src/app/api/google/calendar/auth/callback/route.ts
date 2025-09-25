import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import crypto from "crypto";
import { getCollection } from "@/lib/mongodb";

function verifyState(encoded: string) {
	console.log("=== STATE VERIFICATION DEBUG ===");
	console.log("Encoded state:", encoded);
	console.log("OAUTH_STATE_SECRET exists:", !!process.env.OAUTH_STATE_SECRET);
	console.log(
		"OAUTH_STATE_SECRET length:",
		process.env.OAUTH_STATE_SECRET?.length
	);

	const secret = process.env.OAUTH_STATE_SECRET!;
	if (!secret) {
		throw new Error("OAUTH_STATE_SECRET environment variable is not set");
	}

	const parts = encoded.split(".");
	console.log("State parts count:", parts.length);

	if (parts.length !== 2) {
		throw new Error(
			"Invalid state format - should have 2 parts separated by dot"
		);
	}

	const [data, sig] = parts;
	console.log("Data part length:", data.length);
	console.log("Signature part length:", sig.length);

	// Calculate expected signature
	const expected = crypto
		.createHmac("sha256", secret)
		.update(data)
		.digest("hex");
	console.log("Expected signature:", expected.substring(0, 10) + "...");
	console.log("Received signature:", sig.substring(0, 10) + "...");
	console.log("Signatures match:", sig === expected);

	if (sig !== expected) {
		throw new Error(
			`Invalid state signature. Expected: ${expected.substring(
				0,
				10
			)}..., Got: ${sig.substring(0, 10)}...`
		);
	}

	const decoded = JSON.parse(Buffer.from(data, "hex").toString("utf8"));
	console.log("Decoded payload:", decoded);
	return decoded as { userId: string };
}

function decodeIdToken(idToken?: string): {
	sub?: string;
	email?: string;
	name?: string;
} {
	if (!idToken) return {};
	try {
		const [, payload] = idToken.split(".");
		const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
		const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
		const p = JSON.parse(
			Buffer.from(pad(normalized), "base64").toString("utf8")
		);
		return { sub: p.sub, email: p.email, name: p.name };
	} catch (error) {
		console.error("Error decoding ID token:", error);
		return {};
	}
}

export async function GET(request: NextRequest) {
	try {
		console.log("=== OAUTH CALLBACK DEBUG ===");
		const searchParams = request.nextUrl.searchParams;
		const code = searchParams.get("code");
		const state = searchParams.get("state");
		const error = searchParams.get("error");

		console.log("Callback params:");
		console.log("- code:", code ? "present" : "missing");
		console.log("- state:", state ? "present" : "missing");
		console.log("- error:", error);

		if (error) {
			console.log("OAuth error received:", error);
			return NextResponse.redirect(
				`${request.nextUrl.origin}/test-calendar?error=${error}`
			);
		}

		if (!code || !state) {
			console.log("Missing code or state parameter");
			return NextResponse.json(
				{
					success: false,
					message: "Missing code or state parameter",
				},
				{ status: 400 }
			);
		}

		let decodedState;
		try {
			decodedState = verifyState(state);
		} catch (stateError: any) {
			console.error("State verification failed:", stateError.message);
			return NextResponse.redirect(
				`${
					request.nextUrl.origin
				}/test-calendar?error=invalid_state&details=${encodeURIComponent(
					stateError.message
				)}`
			);
		}

		const { userId } = decodedState;

		const oauth2 = new google.auth.OAuth2(
			process.env.GOOGLE_CLIENT_ID!,
			process.env.GOOGLE_CLIENT_SECRET!,
			process.env.GOOGLE_REDIRECT_URI!
		);

		console.log("Exchanging code for tokens...");
		const { tokens } = await oauth2.getToken(code);
		const {
			sub: googleUserId,
			email,
			name,
		} = decodeIdToken(tokens.id_token as string | undefined);
		console.log("Token exchange successful");

		// Store tokens in database
		const Users = await getCollection("Users");
		await Users.updateOne(
			{ _id: userId as any },
			{
				$set: {
					_id: userId,
					email: email || "unknown@example.com",
					name: name || "Unknown User",
					"Details.Google": {
						Connected: true,
						GoogleUserId: googleUserId || null,
						AccessToken: tokens.access_token ?? null,
						RefreshToken: tokens.refresh_token ?? null,
						ExpiryDate: tokens.expiry_date
							? new Date(tokens.expiry_date)
							: null,
						TokenType: tokens.token_type ?? "Bearer",
						Scopes:
							typeof tokens.scope === "string" ? tokens.scope.split(" ") : [],
						IdToken: tokens.id_token ?? null,
						ConnectedAt: new Date(),
						UpdatedTime: new Date(),
					},
				},
			},
			{ upsert: true }
		);

		console.log("User tokens stored successfully");
		return NextResponse.redirect(
			`${request.nextUrl.origin}/test-calendar?connected=true`
		);
	} catch (error: any) {
		console.error("OAuth callback error:", error);
		return NextResponse.redirect(
			`${
				request.nextUrl.origin
			}/test-calendar?error=callback_failed&details=${encodeURIComponent(
				error.message
			)}`
		);
	}
}
