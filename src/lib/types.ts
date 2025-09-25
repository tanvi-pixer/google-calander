export interface GoogleDetails {
	Connected: boolean;
	GoogleUserId: string | null;
	AccessToken: string | null;
	RefreshToken: string | null;
	ExpiryDate: Date | null;
	TokenType: string;
	Scopes: string[];
	IdToken: string | null;
	ConnectedAt: Date;
	UpdatedTime: Date;
}

export interface User {
	_id: string;
	email: string;
	name: string;
	Details: {
		Google?: GoogleDetails;
	};
}

export interface Calendar {
	userId: string;
	calendarId: string;
	summary: string;
	timeZone: string;
	selected: boolean;
	accessRole: string;
	lastFullSyncAt?: Date;
}

export interface CalendarSyncState {
	userId: string;
	calendarId: string;
	syncToken: string | null;
	lastSyncedAt: Date | null;
}

export interface WatchChannel {
	userId: string;
	calendarId: string;
	channelId: string;
	resourceId: string;
	resourceUri?: string;
	token: string | null;
	expirationMs: number | null;
	status: "active" | "stopped";
	createdAt: Date;
}
