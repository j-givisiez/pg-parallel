/**
 * @file Example worker module that demonstrates file-based task execution
 * This module follows exactly the documentation from the README.md Advanced Usage section.
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  generateReport: async (client, reportType = 'summary') => {
    const { rows } = await client.query("SELECT * FROM (SELECT 1 as id, 'Sample Data' as name) as sales_data");

    // Generate unique report ID using imported uuid
    const reportId = uuidv4();

    // Simulate report generation
    const reportContent = `${reportType} Report for ${rows.length} records`;

    return {
      id: reportId,
      type: reportType,
      recordCount: rows.length,
      generatedAt: new Date().toISOString(),
      content: reportContent,
    };
  },

  // Default handler (called when no taskName is specified)
  handler: async (client, message = 'Default task') => {
    const { rows } = await client.query('SELECT NOW() as timestamp');
    const taskId = uuidv4();
    return { id: taskId, message, timestamp: rows[0].timestamp };
  },
};
