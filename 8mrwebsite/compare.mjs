import { neon } from '@netlify/neon';

export async function handler(event) {
    const assetId = event.queryStringParameters.id;
    if (!assetId) return { statusCode: 400, body: "Missing ID" };

    const sql = neon(); // Automatically uses NETLIFY_DATABASE_URL

    try {
        // 1. CLEANUP: Keep DB under 0.5GB by deleting old scans
        await sql`DELETE FROM item_cache WHERE created_at < NOW() - INTERVAL '10 minutes'`;

        // 2. CHECK CACHE: See if someone scanned this in the last 10 mins
        const cached = await sql`SELECT * FROM item_cache WHERE asset_id = ${assetId} LIMIT 1`;
        if (cached.length > 0) {
            return { 
                statusCode: 200, 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cached[0]) 
            };
        }

        // 3. FETCH LIVE: Get fresh data from Rolimon's
        const response = await fetch('https://www.rolimons.com/itemapi/itemdetails');
        const data = await response.json();
        const item = data.items[assetId];

        if (!item) return { statusCode: 404, body: "Item not found" };

        const newItem = {
            asset_id: assetId,
            name: item[0],
            rap: item[2],
            value: item[3] > 0 ? item[3] : item[2], // Default to RAP if no Value
            copies: item[10] || 0
        };

        // 4. SAVE: Cache for the next 10 minutes
        await sql`INSERT INTO item_cache (asset_id, name, rap, value, copies) 
                  VALUES (${newItem.asset_id}, ${newItem.name}, ${newItem.rap}, ${newItem.value}, ${newItem.copies})`;

        return { 
            statusCode: 200, 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newItem) 
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: "Database Connection Failed" }) };
    }
}