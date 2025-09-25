"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		router.push("/test-calendar");
	}, [router]);

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
			<div className="text-center">
				<div className="animate-pulse">
					<h1 className="text-2xl font-bold text-gray-800 mb-4">
						Google Calendar Integration
					</h1>
					<p className="text-gray-600">Redirecting to calendar...</p>
				</div>
			</div>
		</div>
	);
}
