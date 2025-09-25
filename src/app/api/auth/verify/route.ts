import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
	try {
		const user = await getUserFromRequest(request);

		if (!user) {
			return NextResponse.json(
				{
					success: false,
					message: "Not authenticated",
				},
				{ status: 401 }
			);
		}

		return NextResponse.json({
			success: true,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
		});
	} catch (error: any) {
		return NextResponse.json(
			{
				success: false,
				error: error.message,
			},
			{ status: 500 }
		);
	}
}
