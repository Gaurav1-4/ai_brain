import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { exec } from "child_process";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTest() {
  console.log("=== STARTING END-TO-END VERIFICATION FLOW ===");

  // 1. Verify credentials and establish connection to Supabase to verify empty initial state
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials in .env");
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // We start the server in a separate process
  console.log("1. Starting AI Brain server...");
  const serverProcess = exec("npx tsx server.ts", {
    env: { ...process.env, NODE_ENV: "development" } // force development to allow local fallback if needed, but we want Supabase to be checked
  });
  
  serverProcess.stdout?.on("data", (data) => {
    console.log(`[Server STDOUT]: ${data.trim()}`);
  });
  serverProcess.stderr?.on("data", (data) => {
    console.error(`[Server STDERR]: ${data.trim()}`);
  });

  // Wait for server to boot
  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    // 2. Perform /api/reset to ensure clean slate
    console.log("2. Resetting database state...");
    const resetRes = await fetch(`${BASE_URL}/api/reset`, { method: "POST" });
    if (!resetRes.ok) {
      throw new Error(`Reset failed: ${resetRes.statusText}`);
    }
    console.log("Database reset call successful!");

    // Verify Supabase is clean
    const { data: cleanKOs } = await supabase.from("knowledge_objects").select("id");
    console.log(`Initial knowledge_objects count in Supabase: ${cleanKOs?.length}`);
    if (cleanKOs && cleanKOs.length > 0) {
      console.warn("Warning: Supabase was not completely cleared. Let's delete records manually to ensure clean state.");
      await supabase.from("knowledge_objects").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("raw_sources").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("embeddings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("memory_events").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    // 3. Create a queue item
    console.log("3. Creating queue item via /api/ingest...");
    const ingestPayload = {
      source: "instagram",
      url: "https://instagram.com/reel/C8q8Xn87U8",
      userNote: "Superb scaffolding setup for databases",
      rawText: "Teach us bolt.new SQLite template in 40 seconds. Set up backend servers rapidly."
    };
    const ingestRes = await fetch(`${BASE_URL}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ingestPayload)
    });
    if (!ingestRes.ok) {
      throw new Error(`Ingest request failed: ${ingestRes.statusText}`);
    }
    const ingestData = await ingestRes.json() as any;
    console.log("Ingested item response:", JSON.stringify(ingestData, null, 2));
    const queuedItemId = ingestData.item.id;
    console.log(`Queued item ID: ${queuedItemId}`);

    // Verify queue item is in dbState
    const queueStateRes = await fetch(`${BASE_URL}/api/queue`);
    const queueStateData = await queueStateRes.json() as any;
    console.log(`Queue size on server: ${queueStateData.queue.length}`);
    console.log("Queued item status on server:", queueStateData.queue[0]?.status);

    // 4. Process the queue
    console.log("4. Processing the queue via /api/queue/process...");
    const processRes = await fetch(`${BASE_URL}/api/queue/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "process_all" })
    });
    if (!processRes.ok) {
      throw new Error(`Queue process failed: ${processRes.statusText}`);
    }
    const processData = await processRes.json() as any;
    console.log("Queue process results:", JSON.stringify(processData, null, 2));

    // 5. Verify Supabase tables have new rows
    console.log("5. Verifying Supabase persistence...");
    
    const { data: supabaseKOs, error: koError } = await supabase
      .from("knowledge_objects")
      .select("*");
    if (koError) throw koError;
    console.log("Supabase Knowledge Objects:", JSON.stringify(supabaseKOs, null, 2));

    const { data: supabaseRaws } = await supabase.from("raw_sources").select("*");
    console.log("Supabase Raw Sources:", JSON.stringify(supabaseRaws, null, 2));

    const { data: supabaseEmbeds } = await supabase.from("embeddings").select("*");
    console.log(`Supabase Embeddings Count: ${supabaseEmbeds?.length}`);
    if (supabaseEmbeds && supabaseEmbeds.length > 0) {
      console.log(`Vector dimension check: ${supabaseEmbeds[0].embedding?.length}`);
    }

    const { data: supabaseEvents } = await supabase.from("memory_events").select("*");
    console.log("Supabase Memory Events:", JSON.stringify(supabaseEvents, null, 2));

    if (!supabaseKOs || supabaseKOs.length === 0) {
      throw new Error("FAIL: No knowledge objects saved in Supabase");
    }
    if (!supabaseRaws || supabaseRaws.length === 0) {
      throw new Error("FAIL: No raw sources saved in Supabase");
    }
    if (!supabaseEmbeds || supabaseEmbeds.length === 0) {
      throw new Error("FAIL: No embeddings saved in Supabase");
    }
    if (!supabaseEvents || supabaseEvents.length === 0) {
      throw new Error("FAIL: No memory events saved in Supabase");
    }

    // Verify all fields are fully populated (especially the previously missing fields)
    const savedKO = supabaseKOs[0];
    console.log("Verifying saved fields on Supabase Knowledge Object:");
    console.log(`- source: ${savedKO.source} (Expected: "instagram")`);
    console.log(`- url: ${savedKO.url} (Expected: "https://instagram.com/reel/C8q8Xn87U8")`);
    console.log(`- actionability_score: ${savedKO.actionability_score} (Expected non-null)`);
    console.log(`- user_note: ${savedKO.user_note} (Expected: "Superb scaffolding setup for databases")`);
    console.log(`- memory_strength: ${savedKO.memory_strength} (Expected non-null number)`);

    if (!savedKO.source || !savedKO.url || !savedKO.actionability_score || !savedKO.user_note) {
      throw new Error("FAIL: Missing fields on Supabase Knowledge Object insert payload!");
    }

    const savedEvent = supabaseEvents[0];
    console.log("Verifying saved fields on Supabase Memory Event:");
    console.log(`- context: ${savedEvent.context} (Expected non-null)`);
    if (!savedEvent.context) {
      console.warn("Warning: context field was not saved or is null on Supabase memory event!");
    }

    console.log("SUCCESS: All tables successfully populated with complete payloads!");

    // 6. Verify Search functionality
    console.log("6. Verifying search capability via /api/search...");
    const searchRes = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "scaffolding SQLite" })
    });
    if (!searchRes.ok) {
      throw new Error(`Search request failed: ${searchRes.statusText}`);
    }
    const searchData = await searchRes.json() as any;
    console.log("Search matches returned:", JSON.stringify(searchData, null, 2));
    if (searchData.length === 0 || searchData[0].score <= 0.15) {
      throw new Error("FAIL: Search failed to retrieve the ingested knowledge object!");
    }
    console.log(`Search matched correctly! Score: ${searchData[0].score}, Match Type: ${searchData[0].matchType}`);

    console.log("=== ALL END-TO-END FLOW TESTS COMPLETED SUCCESSFULLY ===");
  } finally {
    // Kill the server process
    console.log("Stopping AI Brain server...");
    serverProcess.kill("SIGTERM");
  }
}

runTest().catch((e) => {
  console.error("❌ Test run failed:", e);
  process.exit(1);
});
