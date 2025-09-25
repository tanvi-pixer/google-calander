"use client";

import { useState, useEffect } from "react";

interface SyncedData {
	calendarsCount: number;
	calendars: Array<{
		calendarId: string;
		summary: string;
		eventCount: number;
	}>;
	totalEvents: number;
	recentEvents: Array<{
		summary: string;
		start: any;
		calendarId: string;
	}>;
	syncStates: Array<{
		calendarId: string;
		lastSyncedAt: string;
		hasSyncToken: boolean;
	}>;
}

export default function TestCalendar() {
	const [user, setUser] = useState<any>(null);
	const [calendars, setCalendars] = useState([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState("");
	const [loginForm, setLoginForm] = useState({ email: "", name: "" });
	const [syncedData, setSyncedData] = useState<SyncedData | null>(null);
	const [showSyncedData, setShowSyncedData] = useState(false);

	useEffect(() => {
		// Simple token check
		const token = localStorage.getItem("auth-token");
		if (token) {
			try {
				const payload = JSON.parse(atob(token.split(".")[1]));
				if (payload.exp * 1000 > Date.now()) {
					setUser({
						id: payload.userId,
						email: payload.email,
						name: payload.name,
					});
					setStatus(`Logged in as ${payload.email}`);
				} else {
					localStorage.removeItem("auth-token");
				}
			} catch (error) {
				localStorage.removeItem("auth-token");
			}
		}
	}, []);

	const login = async () => {
		if (!loginForm.email || !loginForm.name) {
			setStatus("Please enter email and name");
			return;
		}

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(loginForm),
			});

			const data = await response.json();
			if (data.success) {
				localStorage.setItem("auth-token", data.token);
				setUser(data.user);
				setStatus(`✅ Logged in as ${data.user.email}`);
			} else {
				setStatus(`❌ Login failed: ${data.message}`);
			}
		} catch (error) {
			setStatus(`❌ Login error: ${error}`);
		}
	};

	const logout = () => {
		localStorage.removeItem("auth-token");
		setUser(null);
		setCalendars([]);
		setSyncedData(null);
		setShowSyncedData(false);
		setStatus("Logged out");
	};

	const handleRequest = async (url: string, options: RequestInit = {}) => {
		const token = localStorage.getItem("auth-token");
		return fetch(url, {
			...options,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				...options.headers,
			},
		});
	};

	const connectGoogle = async () => {
		window.location.href = "/api/google/calendar/auth/start";
	};

	const listCalendars = async () => {
		setLoading(true);
		try {
			const response = await handleRequest(
				"/api/google/calendar/list-calendars"
			);
			const data = await response.json();
			if (data.success) {
				setCalendars(data.calendars);
				setStatus(`✅ Found ${data.calendars.length} calendars`);
			} else {
				setStatus(`❌ Error: ${data.message}`);
			}
		} catch (error) {
			setStatus(`❌ Error: ${error}`);
		}
		setLoading(false);
	};

	const syncSelected = async () => {
		if (selectedIds.length === 0) {
			setStatus("❌ Please select calendars first");
			return;
		}

		setLoading(true);
		try {
			const response = await handleRequest(
				"/api/google/calendar/sync-selected",
				{
					method: "POST",
					body: JSON.stringify({ calendarIds: selectedIds }),
				}
			);
			const data = await response.json();
			if (data.success) {
				setStatus(`✅ ${data.message}`);
			} else {
				setStatus(`❌ ${data.message}`);
			}
		} catch (error) {
			setStatus(`❌ Sync error: ${error}`);
		}
		setLoading(false);
	};

	const setupWatch = async (calendarId: string) => {
		try {
			const response = await handleRequest("/api/google/calendar/setup-watch", {
				method: "POST",
				body: JSON.stringify({ calendarId }),
			});
			const data = await response.json();
			setStatus(data.success ? `✅ ${data.message}` : `⚠️ ${data.message}`);
		} catch (error) {
			setStatus(`❌ Watch error: ${error}`);
		}
	};

	const viewSyncedData = async () => {
		setLoading(true);
		try {
			const response = await handleRequest("/api/google/calendar/view-data");
			const data = await response.json();
			if (data.success) {
				setSyncedData(data.data);
				setShowSyncedData(true);
				setStatus(
					`✅ Synced Data: ${data.data.totalEvents} events from ${data.data.calendarsCount} calendars`
				);
			} else {
				setStatus(`❌ Error: ${data.error}`);
			}
		} catch (error) {
			setStatus(`❌ Error: ${error}`);
		}
		setLoading(false);
	};

	const formatDate = (dateObj: any) => {
		if (!dateObj) return "No date";
		const date = dateObj.dateTime || dateObj.date;
		if (!date) return "No date";
		return new Date(date).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: dateObj.dateTime ? "numeric" : undefined,
			minute: dateObj.dateTime ? "2-digit" : undefined,
		});
	};

	if (!user) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
				<div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
					<div className="text-center mb-8">
						<h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome</h1>
						<p className="text-gray-600">
							Sign in to access Google Calendar Integration
						</p>
					</div>

					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Email
							</label>
							<input
								type="email"
								placeholder="your-email@example.com"
								value={loginForm.email}
								onChange={(e) =>
									setLoginForm({ ...loginForm, email: e.target.value })
								}
								className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Full Name
							</label>
							<input
								type="text"
								placeholder="Your Full Name"
								value={loginForm.name}
								onChange={(e) =>
									setLoginForm({ ...loginForm, name: e.target.value })
								}
								className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
							/>
						</div>

						<button
							onClick={login}
							className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 font-semibold"
						>
							Login / Register
						</button>
					</div>

					{status && (
						<div className="mt-4 p-3 bg-gray-50 rounded-lg">
							<p className="text-sm text-gray-700">{status}</p>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<div className="bg-white shadow-sm border-b">
				<div className="max-w-7xl mx-auto px-6 py-4">
					<div className="flex justify-between items-center">
						<div>
							<h1 className="text-2xl font-bold text-gray-900">
								Google Calendar Integration
							</h1>
							<p className="text-gray-600">
								Manage your calendar sync and events
							</p>
						</div>
						<div className="flex items-center space-x-4">
							<div className="text-sm">
								<span className="text-gray-500">Logged in as</span>
								<span className="font-medium text-gray-900 ml-1">
									{user.email}
								</span>
							</div>
							<button
								onClick={logout}
								className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
							>
								Logout
							</button>
						</div>
					</div>
				</div>
			</div>

			<div className="max-w-7xl mx-auto p-6">
				{/* Status Banner */}
				{status && (
					<div className="mb-6 p-4 bg-white rounded-lg shadow-sm border-l-4 border-blue-500">
						<p className="font-medium">{status}</p>
					</div>
				)}

				{/* Action Buttons */}
				<div className="grid md:grid-cols-4 gap-4 mb-8">
					<button
						onClick={connectGoogle}
						className="p-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
					>
						🔗 Connect Google
					</button>

					<button
						onClick={listCalendars}
						disabled={loading}
						className="p-4 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors font-semibold"
					>
						📅 {loading ? "Loading..." : "List Calendars"}
					</button>

					<button
						onClick={syncSelected}
						disabled={loading || selectedIds.length === 0}
						className="p-4 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors font-semibold"
					>
						⚡ Sync Selected
					</button>

					<button
						onClick={viewSyncedData}
						disabled={loading}
						className="p-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors font-semibold"
					>
						📊 View Data
					</button>
				</div>

				<div className="grid lg:grid-cols-2 gap-8">
					{/* Calendars Section */}
					{calendars.length > 0 && (
						<div className="bg-white rounded-lg shadow-sm p-6">
							<h2 className="text-xl font-semibold text-gray-900 mb-4">
								Your Calendars
							</h2>
							<div className="space-y-3">
								{calendars.map((cal: any) => (
									<div
										key={cal.id}
										className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
									>
										<div className="flex items-center">
											<input
												type="checkbox"
												checked={selectedIds.includes(cal.id)}
												onChange={(e) => {
													if (e.target.checked) {
														setSelectedIds([...selectedIds, cal.id]);
													} else {
														setSelectedIds(
															selectedIds.filter((id) => id !== cal.id)
														);
													}
												}}
												className="mr-3 h-4 w-4 text-blue-600 rounded"
											/>
											<div>
												<p className="font-medium text-gray-900">
													{cal.summary}
												</p>
												<p className="text-sm text-gray-500">
													{cal.accessRole}
												</p>
											</div>
										</div>
										<button
											onClick={() => setupWatch(cal.id)}
											className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200 transition-colors"
										>
											Setup Watch
										</button>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Synced Data Section */}
					{showSyncedData && syncedData && (
						<div className="bg-white rounded-lg shadow-sm p-6">
							<div className="flex justify-between items-center mb-4">
								<h2 className="text-xl font-semibold text-gray-900">
									Synced Data Overview
								</h2>
								<button
									onClick={() => setShowSyncedData(false)}
									className="text-gray-400 hover:text-gray-600"
								>
									✕
								</button>
							</div>

							{/* Stats Cards */}
							<div className="grid grid-cols-2 gap-4 mb-6">
								<div className="bg-blue-50 rounded-lg p-4 text-center">
									<p className="text-2xl font-bold text-blue-600">
										{syncedData.calendarsCount}
									</p>
									<p className="text-sm text-blue-600">Synced Calendars</p>
								</div>
								<div className="bg-green-50 rounded-lg p-4 text-center">
									<p className="text-2xl font-bold text-green-600">
										{syncedData.totalEvents}
									</p>
									<p className="text-sm text-green-600">Total Events</p>
								</div>
							</div>

							{/* Calendar Breakdown */}
							<div className="mb-6">
								<h3 className="font-medium text-gray-900 mb-3">
									Calendar Breakdown
								</h3>
								<div className="space-y-2">
									{syncedData.calendars.map((cal, idx) => (
										<div
											key={idx}
											className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded"
										>
											<span className="text-sm font-medium truncate">
												{cal.summary}
											</span>
											<span className="text-sm text-gray-600">
												{cal.eventCount} events
											</span>
										</div>
									))}
								</div>
							</div>

							{/* Recent Events */}
							{syncedData.recentEvents.length > 0 && (
								<div>
									<h3 className="font-medium text-gray-900 mb-3">
										Recent Events
									</h3>
									<div className="space-y-2 max-h-60 overflow-y-auto">
										{syncedData.recentEvents.slice(0, 10).map((event, idx) => (
											<div key={idx} className="p-3 border rounded-lg">
												<p className="font-medium text-gray-900 text-sm">
													{event.summary}
												</p>
												<p className="text-xs text-gray-500">
													{formatDate(event.start)}
												</p>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
