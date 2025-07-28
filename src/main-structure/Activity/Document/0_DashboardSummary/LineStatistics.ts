import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

/**
 * Optimized line code statistics with efficient aggregation
 * Enhanced dengan date dan department filters
 */
export const getLineCodeStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      status,
      exclude_done,
      department_id,
      limit = "10",
      // NEW: Date filters support
      start_date,
      end_date
    } = req.query;
    
    console.log('📊 Getting line code statistics with filters:', {
      status, exclude_done, department_id, limit, start_date, end_date
    });
    
    // Build efficient where condition dengan date filters
    const whereCondition: any = {
      is_deleted: false
    };
    
    // Status filters
    if (status) {
      whereCondition.status = status as string;
    }
    
    if (exclude_done === 'true') {
      whereCondition.status = {
        not: 'done'
      };
    }
    
    // Department filter
    if (department_id) {
      whereCondition.department_id = parseInt(department_id as string);
    }
    
    // NEW: Date range filter dengan proper timezone handling
    if (start_date || end_date) {
      whereCondition.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        whereCondition.created_date.gte = startDate;
        console.log(`Filter from date: ${startDate.toISOString()}`);
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        whereCondition.created_date.lte = endDate;
        console.log(`Filter to date: ${endDate.toISOString()}`);
      }
    }
    
    // Use groupBy for efficient aggregation dengan filters
    const lineCodeGroups = await prismaDB2.tr_proposed_changes.groupBy({
      by: ['line_code'],
      where: whereCondition,
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: parseInt(limit as string) + 5 // Get a few extra for "Others" calculation
    });

    console.log(`Found ${lineCodeGroups.length} line code groups with filters applied`);

    // Get total for percentage calculation dengan same filters
    const totalCount = await prismaDB2.tr_proposed_changes.count({
      where: whereCondition
    });

    console.log(`Total documents matching filters: ${totalCount}`);

    // Process results efficiently
    const limitNum = parseInt(limit as string);
    let lineCodeStats = lineCodeGroups.map(group => {
      const lineCode = group.line_code || 'Unknown';
      const totalDocuments = group._count.id;
      const percentage = totalCount > 0 ? (totalDocuments / totalCount) * 100 : 0;

      return {
        line_code: lineCode,
        total_documents: totalDocuments,
        percentage: parseFloat(percentage.toFixed(2))
      };
    });

    // Handle "Others" grouping if needed
    if (lineCodeStats.length > limitNum) {
      const topItems = lineCodeStats.slice(0, limitNum);
      const otherItems = lineCodeStats.slice(limitNum);
      
      if (otherItems.length > 0) {
        const totalOtherDocuments = otherItems.reduce((sum, item) => sum + item.total_documents, 0);
        const otherPercentage = totalCount > 0 ? (totalOtherDocuments / totalCount) * 100 : 0;
        
        topItems.push({
          line_code: "Others",
          total_documents: totalOtherDocuments,
          percentage: parseFloat(otherPercentage.toFixed(2))
        });
      }
      
      lineCodeStats = topItems;
    }

    // Prepare chart data
    const chartData = {
      labels: lineCodeStats.map(item => item.line_code),
      datasets: [
        {
          data: lineCodeStats.map(item => item.total_documents),
          backgroundColor: generateColors(lineCodeStats.length)
        }
      ]
    };

    // Enhanced response dengan filter information
    res.status(200).json({
      status: "success",
      message: "Line code statistics retrieved successfully",
      summary: {
        total_documents: totalCount,
        total_line_codes: lineCodeGroups.length,
        limit_applied: limitNum,
        // NEW: Filter summary
        filters_applied: {
          status: status || null,
          exclude_done: exclude_done === 'true',
          department_id: department_id ? parseInt(department_id as string) : null,
          date_range: start_date && end_date ? `${start_date} to ${end_date}` : null
        }
      },
      data: lineCodeStats,
      chart_data: chartData
    });

  } catch (error) {
    console.error("Error fetching line code statistics:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch line code statistics",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Optimized line code flow statistics
 * Enhanced dengan date dan department filters
 */
export const getLineCodeStatusFlow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      department_id,
      // NEW: Date filters support
      start_date,
      end_date
    } = req.query;
    
    console.log('📊 Getting line code flow with filters:', {
      department_id, start_date, end_date
    });
    
    // Build where condition dengan date filters
    const whereCondition: any = {
      is_deleted: false
    };
    
    // Department filter
    if (department_id) {
      whereCondition.department_id = parseInt(department_id as string);
    }

    // NEW: Date range filter dengan proper timezone handling
    if (start_date || end_date) {
      whereCondition.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        whereCondition.created_date.gte = startDate;
        console.log(`Filter from date: ${startDate.toISOString()}`);
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        whereCondition.created_date.lte = endDate;
        console.log(`Filter to date: ${endDate.toISOString()}`);
      }
    }

    // Get line code groups with counts (dengan filters)
    const lineCodeGroups = await prismaDB2.tr_proposed_changes.groupBy({
      by: ['line_code'],
      where: whereCondition,
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 15 // Limit for performance
    });

    console.log(`Found ${lineCodeGroups.length} line code groups for flow analysis`);

    // Get detailed workflow data for each line code dengan same filters
    const flowStats = await Promise.all(
      lineCodeGroups.map(async (group) => {
        const lineCode = group.line_code || 'Unknown';
        
        // Base condition untuk specific line code dengan filters
        const lineCodeCondition = {
          ...whereCondition,
          line_code: group.line_code
        };
        
        // Count documents in different stages for this line code
        const [proposedOnly, inAuthorization, inHandover, completed] = await Promise.all([
          // Proposed only (no auth docs)
          prismaDB2.tr_proposed_changes.count({
            where: {
              ...lineCodeCondition,
              authorizationDocs: {
                none: {}
              }
            }
          }),

          // In authorization (has auth doc, no handover)
          prismaDB2.tr_proposed_changes.count({
            where: {
              ...lineCodeCondition,
              authorizationDocs: {
                some: {}
              },
              tr_handover: {
                none: {}
              }
            }
          }),

          // In handover (not finished)
          prismaDB2.tr_proposed_changes.count({
            where: {
              ...lineCodeCondition,
              tr_handover: {
                some: {
                  is_finished: false
                }
              }
            }
          }),

          // Completed
          prismaDB2.tr_proposed_changes.count({
            where: {
              ...lineCodeCondition,
              tr_handover: {
                some: {
                  is_finished: true
                }
              }
            }
          })
        ]);

        const totalDocuments = group._count.id;
        const completionRate = totalDocuments > 0 ? (completed / totalDocuments) * 100 : 0;

        return {
          line_code: lineCode,
          total_documents: totalDocuments,
          workflow: {
            proposed_only: proposedOnly,
            in_authorization: inAuthorization,
            in_handover: inHandover,
            completed: completed
          },
          completion_rate: parseFloat(completionRate.toFixed(2))
        };
      })
    );

    // Prepare chart data
    const workflowChartData = {
      labels: flowStats.map(item => item.line_code),
      datasets: [
        {
          label: 'Proposed Only',
          data: flowStats.map(item => item.workflow.proposed_only),
          backgroundColor: '#36A2EB'
        },
        {
          label: 'In Authorization',
          data: flowStats.map(item => item.workflow.in_authorization),
          backgroundColor: '#FFCE56'
        },
        {
          label: 'In Handover',
          data: flowStats.map(item => item.workflow.in_handover),
          backgroundColor: '#FF9F40'
        },
        {
          label: 'Completed',
          data: flowStats.map(item => item.workflow.completed),
          backgroundColor: '#4BC0C0'
        }
      ]
    };

    // Calculate totals
    const totals = flowStats.reduce((acc, item) => ({
      proposed_only: acc.proposed_only + item.workflow.proposed_only,
      in_authorization: acc.in_authorization + item.workflow.in_authorization,
      in_handover: acc.in_handover + item.workflow.in_handover,
      completed: acc.completed + item.workflow.completed
    }), { proposed_only: 0, in_authorization: 0, in_handover: 0, completed: 0 });

    const grandTotal = totals.proposed_only + totals.in_authorization + totals.in_handover + totals.completed;

    // Enhanced response dengan filter information
    res.status(200).json({
      status: "success",
      message: "Line code flow statistics retrieved successfully",
      summary: {
        total_documents: grandTotal,
        total_line_codes: flowStats.length,
        workflow_summary: totals,
        completion_rate: grandTotal > 0 ? parseFloat(((totals.completed / grandTotal) * 100).toFixed(2)) : 0,
        // NEW: Filter summary
        filters_applied: {
          department_id: department_id ? parseInt(department_id as string) : null,
          date_range: start_date && end_date ? `${start_date} to ${end_date}` : null
        }
      },
      data: flowStats,
      chart_data: workflowChartData
    });

  } catch (error) {
    console.error("Error fetching line code flow statistics:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to fetch line code flow statistics",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Generate colors for charts
 */
function generateColors(count: number): string[] {
  const baseColors = [
    '#3b82f6', '#f59e0b', '#10b981', '#f97316', 
    '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e',
    '#64748b', '#0ea5e9', '#f97316', '#22c55e'
  ];
  
  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  } else {
    const colors = [...baseColors];
    for (let i = baseColors.length; i < count; i++) {
      colors.push('#' + Math.floor(Math.random() * 16777215).toString(16));
    }
    return colors;
  }
}