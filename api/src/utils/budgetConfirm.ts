import type mysql from 'mysql2/promise';

const COST_BUDGET_RATIO = 0.8;

const DEFAULT_SPLITS = [
  { costCode: 'EST-LABOR', category: 'Labor', description: 'Estimated labor (80% budget)', share: 0.25 },
  { costCode: 'EST-SUBS', category: 'Subcontractors', description: 'Estimated subs (80% budget)', share: 0.40 },
  { costCode: 'EST-MAT', category: 'Materials', description: 'Estimated materials (80% budget)', share: 0.25 },
  { costCode: 'EST-OTHER', category: 'Other', description: 'Estimated other / equipment (80% budget)', share: 0.10 },
] as const;

export async function confirmEstimatedBudgetForProject(
  conn: mysql.PoolConnection,
  projectId: string,
): Promise<{ inserted: number; totalBudget: number }> {
  const [projectRows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT id, job_number, original_contract_amount, revised_contract_amount
     FROM brighten_pm.projects
     WHERE id = ?
     LIMIT 1`,
    [projectId],
  );
  const project = projectRows[0];
  if (!project) {
    throw new Error('Project not found');
  }

  const contract = Number(project.revised_contract_amount ?? project.original_contract_amount ?? 0);
  if (!Number.isFinite(contract) || contract <= 0) {
    throw new Error('Project contract amount is required before confirming an 80% budget');
  }

  const [existing] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS line_count FROM brighten_pm.budget_lines WHERE project_id = ?`,
    [projectId],
  );
  const lineCount = Number(existing[0]?.line_count ?? 0);
  if (lineCount > 0) {
    throw new Error('Budget lines already exist — import or edit budget instead of confirming estimate');
  }

  const totalBudget = Math.round(contract * COST_BUDGET_RATIO * 100) / 100;
  let inserted = 0;

  for (const split of DEFAULT_SPLITS) {
    const budgetAmount = Math.round(totalBudget * split.share * 100) / 100;
    await conn.query(
      `INSERT INTO brighten_pm.budget_lines
        (project_id, cost_code, category, description, budget_amount, actual_to_date, committed_amount,
         projected_final_cost, variance_amount, source_type, status, notes)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'estimated_80pct', 'Active', ?)`,
      [
        projectId,
        split.costCode,
        split.category,
        split.description,
        budgetAmount,
        budgetAmount,
        budgetAmount,
        'Confirmed 80% target budget from office',
      ],
    );
    inserted += 1;
  }

  return { inserted, totalBudget };
}
