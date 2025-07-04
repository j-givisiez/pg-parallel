import 'dotenv/config';
import * as path from 'path';
import { PgParallel } from '../src/pg-parallel';

const describeif = process.env.DATABASE_URL ? describe : describe.skip;

describeif('WorkerFileTask (Integration)', () => {
  let db: PgParallel;

  beforeEach(() => {
    db = new PgParallel({
      connectionString: process.env.DATABASE_URL,
      maxWorkers: 2,
    });
  });

  afterEach(async () => {
    await db.shutdown();
  });

  describe('File-based worker execution', () => {
    it('should execute default handler from external file', async () => {
      const result = await db.worker({
        taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
        args: ['Test message from integration test'],
      });

      expect(result).toEqual({
        id: expect.any(String),
        message: 'Test message from integration test',
        timestamp: expect.any(String),
      });
    });

    it('should execute named function from external file', async () => {
      const result = await db.worker({
        taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
        taskName: 'generateReport',
        args: ['integration-test'],
      });

      expect(result).toEqual({
        id: expect.any(String),
        type: 'integration-test',
        recordCount: 1,
        generatedAt: expect.any(String),
        content: 'integration-test Report for 1 records',
      });
    });

    it('should execute handler with different arguments', async () => {
      const result = await db.worker({
        taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
        args: ['Custom message for handler'],
      });

      expect(result).toEqual({
        id: expect.any(String),
        message: 'Custom message for handler',
        timestamp: expect.any(String),
      });
    });

    it('should handle errors in file-based tasks', async () => {
      await expect(
        db.worker({
          taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
          taskName: 'nonExistentFunction',
          args: [],
        }),
      ).rejects.toThrow("Task 'nonExistentFunction' not found or not a function");
    });

    it('should handle invalid file paths', async () => {
      await expect(
        db.worker({
          taskPath: '/path/to/nonexistent/file.js',
          taskName: 'handler',
          args: [],
        }),
      ).rejects.toThrow();
    });

    it('should run multiple file-based tasks in parallel', async () => {
      const tasks = [
        db.worker({
          taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
          taskName: 'generateReport',
          args: ['parallel-1'],
        }),
        db.worker({
          taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
          taskName: 'generateReport',
          args: ['parallel-2'],
        }),
        db.worker({
          taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
          args: ['parallel-default'],
        }),
      ];

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(3);
      expect((results[0] as any).id).toEqual(expect.any(String));
      expect((results[0] as any).type).toBe('parallel-1');
      expect((results[1] as any).id).toEqual(expect.any(String));
      expect((results[1] as any).type).toBe('parallel-2');
      expect((results[2] as any).id).toEqual(expect.any(String));
      expect((results[2] as any).message).toBe('parallel-default');
    });

    it('should mix function-based and file-based workers', async () => {
      const tasks = [
        // Function-based worker
        db.worker(async (client) => {
          const { rows } = await client.query('SELECT $1 as message', ['from-function']);
          return { source: 'function', data: rows[0] };
        }),
        // File-based worker
        db.worker({
          taskPath: path.resolve(__dirname, '../examples/tasks/report-worker.js'),
          args: ['from-file'],
        }),
      ];

      const results = await Promise.all(tasks);

      expect(results).toHaveLength(2);
      expect((results[0] as any).source).toBe('function');
      expect((results[0] as any).data.message).toBe('from-function');
      expect((results[1] as any).id).toEqual(expect.any(String));
      expect((results[1] as any).message).toBe('from-file');
    });
  });
});
