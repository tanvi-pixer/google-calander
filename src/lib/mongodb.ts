import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);

let cachedDb: Db | null = null;

export async function connectToDatabase() {
	if (cachedDb) return cachedDb;

	await client.connect();
	const db = client.db();
	cachedDb = db;
	return db;
}

export async function getCollection(name: string) {
	const db = await connectToDatabase();
	return db.collection(name);
}
