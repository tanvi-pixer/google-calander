import { google } from "googleapis";

export function createCalendarClient(tokens: {
	AccessToken: string | null;
	RefreshToken: string;
	ExpiryDate?: Date | null;
}) {
	const oauth2 = new google.auth.OAuth2(
		process.env.GOOGLE_CLIENT_ID!,
		process.env.GOOGLE_CLIENT_SECRET!,
		process.env.GOOGLE_REDIRECT_URI!
	);

	oauth2.setCredentials({
		access_token: tokens.AccessToken || undefined,
		refresh_token: tokens.RefreshToken,
		expiry_date: tokens.ExpiryDate
			? new Date(tokens.ExpiryDate).getTime()
			: undefined,
	});

	return google.calendar({ version: "v3", auth: oauth2 });
}
