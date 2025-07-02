require("dotenv/config");
const { PgParallel } = require("./dist"); // Import from the compiled output

/**
 * A comprehensive test script to validate the compiled 'dist' output.
 */
const testDist = async () => {
  console.log("\n--- Testing compiled output in dist/ ---");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Skipping dist test.");
    return; // Use return for clearer flow
  }

  const db = new PgParallel({
    connectionString: process.env.DATABASE_URL,
    maxWorkers: 2,
  });

  const noWorkerDb = new PgParallel({
    connectionString: process.env.DATABASE_URL,
    maxWorkers: 0,
  });

  try {
    // Test 1: Simple query on the main thread
    console.log("Running: db.query() test...");
    const { rows } = await db.query("SELECT 1 AS value");
    if (rows[0].value !== 1) throw new Error("db.query() returned incorrect data.");
    console.log("✅ db.query() test passed.");

    // Test 2: Simple task on a worker thread
    console.log("Running: db.task() test...");
    const taskResult = await db.task((a, b) => a + b, [5, 10]);
    if (taskResult !== 15) throw new Error("db.task() returned incorrect data.");
    console.log("✅ db.task() test passed.");

    // Test 3: Mixed task with a client in a worker
    console.log("Running: db.worker() test...");
    const workerResult = await db.worker(async (client) => {
      const res = await client.query("SELECT 10 AS value");
      return res.rows[0].value * 2;
    });
    if (workerResult !== 20) throw new Error("db.worker() returned incorrect data.");
    console.log("✅ db.worker() test passed.");

    // Test 4: Error handling for failing tasks
    console.log("Running: Error handling test...");
    try {
      await db.task(() => {
        throw new Error("Task Failed");
      }, []);
      throw new Error("Error handling test failed: Did not throw.");
    } catch (error) {
      if (error.message !== "Task Failed") {
        throw new Error(`Error handling test failed: Incorrect message "${error.message}"`);
      }
      console.log("✅ Error handling test passed.");
    }

    // Test 5: maxWorkers = 0 configuration
    console.log("Running: maxWorkers=0 test...");
    try {
      await noWorkerDb.task(() => { }, []);
      throw new Error("maxWorkers=0 test failed: Did not throw.");
    } catch (error) {
      if (!error.message.includes("No workers available")) {
        throw new Error(`maxWorkers=0 test failed: Incorrect message "${error.message}"`);
      }
      console.log("✅ maxWorkers=0 test passed.");
    }

    console.log("\n✅ All dist build tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Dist build test failed:", error);
    process.exit(1);
  } finally {
    await db.shutdown();
    await noWorkerDb.shutdown();
  }
};

testDist(); 