// Enhanced DepartmentInvolve.ts - Update dengan filter lengkap
import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

/**
 * Enhanced getDepartmentInvolvement dengan filter lengkap untuk frontend
 */
export const getDepartmentInvolvement = async (req: Request, res: Response): Promise<void> => {
  try {
    // Extract filter parameters dari frontend
    const {
      start_date,      // Format: YYYY-MM-DD
      end_date,        // Format: YYYY-MM-DD  
      department_id,   // Filter specific department
      include_inactive = false
    } = req.query;

    console.log('📊 Getting department involvement with filters:', {
      start_date,
      end_date,
      department_id,
      include_inactive
    });

    // Build date filter dengan proper timezone handling
    const dateFilter: any = {};
    if (start_date) {
      const startDate = new Date(start_date as string);
      startDate.setHours(0, 0, 0, 0); // Start of day
      dateFilter.gte = startDate;
    }
    if (end_date) {
      const endDate = new Date(end_date as string);
      endDate.setHours(23, 59, 59, 999); // End of day
      dateFilter.lte = endDate;
    }

    // Build department filter
    const departmentFilter: any = {
      is_deleted: false
    };
    
    if (include_inactive !== 'true') {
      departmentFilter.status = true;
    }

    // If specific department requested
    if (department_id) {
      departmentFilter.id = parseInt(department_id as string);
    }

    // 1. Get departments based on filter
    const departments = await prismaDB2.mst_department.findMany({
      where: departmentFilter,
      select: {
        id: true,
        department_name: true,
        department_code: true,
        plant: {
          select: {
            id: true,
            plant_name: true
          }
        }
      }
    });

    console.log(`Found ${departments.length} departments matching criteria`);

    // 2. For each department, calculate involvement with date filtering
    const result = await Promise.all(departments.map(async (dept) => {
      // Build the where condition for proposed changes
      const proposedChangesWhere: any = {
        department_id: dept.id,
        is_deleted: false
      };

      // Add date filter if provided
      if (Object.keys(dateFilter).length > 0) {
        proposedChangesWhere.created_date = dateFilter;
      }

      // A. Count total documents (from proposed changes)
      const totalDocuments = await prismaDB2.tr_proposed_changes.count({
        where: proposedChangesWhere
      });

      // B. Count documents still in proposed changes stage
      const proposedOnlyIds = await prismaDB2.tr_proposed_changes.findMany({
        where: {
          ...proposedChangesWhere,
          authorizationDocs: {
            none: {}
          }
        },
        select: { id: true }
      });

      // C. Count documents in authorization stage
      const authOnlyIds = await prismaDB2.tr_proposed_changes.findMany({
        where: {
          ...proposedChangesWhere,
          authorizationDocs: {
            some: {}
          },
          tr_handover: {
            none: {}
          }
        },
        select: { id: true }
      });

      // D. Count documents in handover stage (not finished)
      const handoverNotFinishedIds = await prismaDB2.tr_proposed_changes.findMany({
        where: {
          ...proposedChangesWhere,
          tr_handover: {
            some: {
              is_finished: false
            }
          }
        },
        select: { id: true }
      });

      // E. Count completed documents
      const completedIds = await prismaDB2.tr_proposed_changes.findMany({
        where: {
          ...proposedChangesWhere,
          tr_handover: {
            some: {
              is_finished: true
            }
          }
        },
        select: { id: true }
      });

      // F. Calculate additional metrics
      const completionRate = totalDocuments > 0 ? 
        Math.round((completedIds.length / totalDocuments) * 100) : 0;

      const averageCompletionTime = await calculateAverageCompletionTime(
        dept.id, 
        dateFilter
      );

      return {
        department_id: dept.id,
        department_name: dept.department_name,
        department_code: dept.department_code,
        plant_name: dept.plant?.plant_name || "-",
        
        total_dokumen: totalDocuments,
        status_dokumen: {
          tahap_proposed_changes: proposedOnlyIds.length,
          tahap_authorization: authOnlyIds.length,
          tahap_handover: handoverNotFinishedIds.length,
          sudah_selesai: completedIds.length
        },
        
        // Additional metrics for frontend
        completion_rate: completionRate,
        average_completion_days: averageCompletionTime,
        
        // Verification
        total_by_status: proposedOnlyIds.length + authOnlyIds.length + 
                        handoverNotFinishedIds.length + completedIds.length
      };
    }));

    // 3. Sort by total documents (descending)
    result.sort((a, b) => b.total_dokumen - a.total_dokumen);

    // 4. Add summary statistics
    const summary = {
      total_departments: result.length,
      total_documents: result.reduce((sum, dept) => sum + dept.total_dokumen, 0),
      average_completion_rate: result.length > 0 ? 
        Math.round(result.reduce((sum, dept) => sum + dept.completion_rate, 0) / result.length) : 0,
      filters_applied: {
        date_range: start_date && end_date ? `${start_date} to ${end_date}` : null,
        specific_department: department_id ? parseInt(department_id as string) : null,
        include_inactive: include_inactive === 'true'
      }
    };

    res.status(200).json({
      status: "success",
      message: "Department involvement data retrieved successfully",
      summary: summary,
      data: result
    });
    
  } catch (error) {
    console.error("Error getting department involvement:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get department involvement data",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Calculate average completion time for a department with date filter
 */
async function calculateAverageCompletionTime(
  departmentId: number, 
  dateFilter: any
): Promise<number> {
  try {
    const proposedChangesWhere: any = {
      department_id: departmentId,
      is_deleted: false,
      tr_handover: {
        some: {
          is_finished: true,
          finished_date: { not: null }
        }
      }
    };

    if (Object.keys(dateFilter).length > 0) {
      proposedChangesWhere.created_date = dateFilter;
    }

    const completedDocuments = await prismaDB2.tr_proposed_changes.findMany({
      where: proposedChangesWhere,
      select: {
        created_date: true,
        tr_handover: {
          where: {
            is_finished: true,
            finished_date: { not: null }
          },
          select: {
            finished_date: true
          },
          take: 1
        }
      }
    });

    if (completedDocuments.length === 0) return 0;

    const totalDays = completedDocuments.reduce((sum, doc) => {
      if (doc.tr_handover[0]?.finished_date && doc.created_date) {
        const diffTime = new Date(doc.tr_handover[0].finished_date).getTime() - 
                        new Date(doc.created_date).getTime();
        const diffDays = diffTime / (1000 * 60 * 60 * 24);
        return sum + diffDays;
      }
      return sum;
    }, 0);

    return Math.round(totalDays / completedDocuments.length);
  } catch (error) {
    console.error("Error calculating average completion time:", error);
    return 0;
  }
}

// Enhanced DocumentLevelling.ts - Update dengan filter lengkap
export async function getDocumentStatusMapping(req: Request, res: Response) {
  try {
    // Extract filter parameters dari frontend
    const { start_date, end_date, department_id } = req.query;
    
    console.log('📊 Getting document status mapping with filters:', {
      start_date, end_date, department_id
    });

    // Build base filter dengan date handling
    const baseFilter: any = {
      is_deleted: false
    };

    // Add date filter dengan proper timezone
    if (start_date || end_date) {
      baseFilter.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        baseFilter.created_date.gte = startDate;
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        baseFilter.created_date.lte = endDate;
      }
    }

    // Add department filter
    if (department_id) {
      baseFilter.department_id = parseInt(department_id as string);
    }

    // Get total active documents dengan filter
    const totalDocuments = await prismaDB2.tr_proposed_changes.count({
      where: baseFilter
    });

    // Get documents still in proposed_changes stage
    const proposedChangesStage = await prismaDB2.tr_proposed_changes.count({
      where: {
        ...baseFilter,
        authorizationDocs: {
          none: {}
        }
      }
    });

    // Get documents in authorization stage
    const authorizationStage = await prismaDB2.tr_proposed_changes.count({
      where: {
        ...baseFilter,
        authorizationDocs: {
          some: {
            tr_handover: {
              none: {}
            }
          }
        }
      }
    });

    // Get documents in handover stage (not finished) dengan filter
    const handoverFilter: any = {
      is_deleted: false,
      is_finished: false
    };

    // Add department filter untuk handover
    if (department_id) {
      handoverFilter.department_id = parseInt(department_id as string);
    }

    // Add date filter untuk handover berdasarkan created_date
    if (start_date || end_date) {
      handoverFilter.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        handoverFilter.created_date.gte = startDate;
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        handoverFilter.created_date.lte = endDate;
      }
    }

    const handoverStage = await prismaDB2.tr_handover.count({
      where: handoverFilter
    });

    // Get completed documents dengan filter
    const completedFilter: any = {
      is_deleted: false,
      is_finished: true
    };

    // Add department filter untuk completed
    if (department_id) {
      completedFilter.department_id = parseInt(department_id as string);
    }

    // Add date filter untuk completed berdasarkan finished_date atau created_date
    if (start_date || end_date) {
      // Filter by finished_date for completed documents
      completedFilter.finished_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        completedFilter.finished_date.gte = startDate;
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        completedFilter.finished_date.lte = endDate;
      }
    }

    const completedDocuments = await prismaDB2.tr_handover.count({
      where: completedFilter
    });

    // Calculate percentages
    const calculatePercentage = (value: number, total: number) => 
      total > 0 ? Math.round((value / total) * 100) : 0;

    // Get trend data untuk growth calculation (last 30 days comparison)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const previousPeriodFilter = {
      ...baseFilter,
      created_date: {
        gte: thirtyDaysAgo,
        lte: start_date ? new Date(start_date as string) : new Date()
      }
    };

    const previousPeriodTotal = await prismaDB2.tr_proposed_changes.count({
      where: previousPeriodFilter
    });

    const growthRate = previousPeriodTotal > 0 ? 
      Math.round(((totalDocuments - previousPeriodTotal) / previousPeriodTotal) * 100) : 0;

    res.json({
      totalDocuments,
      documentsByStage: {
        proposedChanges: proposedChangesStage,
        authorization: authorizationStage,
        handover: handoverStage,
        completed: completedDocuments
      },
      percentages: {
        proposedChanges: calculatePercentage(proposedChangesStage, totalDocuments),
        authorization: calculatePercentage(authorizationStage, totalDocuments),
        handover: calculatePercentage(handoverStage, totalDocuments),
        completed: calculatePercentage(completedDocuments, totalDocuments)
      },
      trends: {
        growth_rate: growthRate,
        previous_period_total: previousPeriodTotal
      },
      filters: {
        date_range: start_date && end_date ? `${start_date} to ${end_date}` : null,
        department_id: department_id ? parseInt(department_id as string) : null
      }
    });
  } catch (error) {
    console.error("Error fetching document mapping:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

// Enhanced LineStatistics.ts - Update dengan filter lengkap
export const getLineCodeStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      status,
      exclude_done,
      department_id,
      limit,
      start_date,        // New: Date filter dari frontend
      end_date,          // New: Date filter dari frontend
      min_documents = 1
    } = req.query;
    
    console.log('📊 Getting line code statistics with filters:', {
      status, exclude_done, department_id, limit, start_date, end_date, min_documents
    });

    // Build comprehensive filter condition
    const whereCondition: any = {
      is_deleted: false
    };
    
    // Status filters
    if (status) {
      whereCondition.status = status as string;
    }
    
    if (exclude_done === 'true') {
      whereCondition.status = { not: 'done' };
    }
    
    // Department filter
    if (department_id) {
      whereCondition.department_id = parseInt(department_id as string);
    }
    
    // Date range filter dengan proper timezone handling
    if (start_date || end_date) {
      whereCondition.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        whereCondition.created_date.gte = startDate;
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        whereCondition.created_date.lte = endDate;
      }
    }
    
    // Get all documents matching filters
    const allProposedChanges = await prismaDB2.tr_proposed_changes.findMany({
      where: whereCondition,
      select: {
        id: true,
        line_code: true,
        status: true,
        project_name: true,
        created_date: true,
        department: {
          select: {
            department_name: true
          }
        }
      }
    });
    
    console.log(`Found ${allProposedChanges.length} documents matching filters`);
    
    // Group by line_code
    const lineCodeGroups: { [key: string]: any[] } = {};
    
    allProposedChanges.forEach(doc => {
      const lineCode = doc.line_code || 'Unknown';
      if (!lineCodeGroups[lineCode]) {
        lineCodeGroups[lineCode] = [];
      }
      lineCodeGroups[lineCode].push(doc);
    });
    
    // Process statistics for each line code
    let lineCodeStats = Object.keys(lineCodeGroups)
      .map(lineCode => {
        const documents = lineCodeGroups[lineCode];
        const totalDocuments = documents.length;
        
        // Apply minimum documents filter
        if (totalDocuments < parseInt(min_documents as string)) {
          return null;
        }
        
        // Status breakdown
        const statusCount: { [key: string]: number } = {};
        documents.forEach(doc => {
          const status = doc.status || 'unknown';
          statusCount[status] = (statusCount[status] || 0) + 1;
        });
        
        // Department breakdown
        const departmentCount: { [key: string]: number } = {};
        documents.forEach(doc => {
          const dept = doc.department?.department_name || 'Unknown';
          departmentCount[dept] = (departmentCount[dept] || 0) + 1;
        });
        
        // Calculate percentage and trends
        const percentage = allProposedChanges.length > 0 ? 
          (totalDocuments / allProposedChanges.length) * 100 : 0;
        
        // Recent documents for preview
        const recentDocuments = documents
          .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
          .slice(0, 5)
          .map(doc => ({
            id: doc.id,
            project_name: doc.project_name,
            status: doc.status,
            created_date: doc.created_date,
            department: doc.department?.department_name
          }));
        
        return {
          line_code: lineCode,
          total_documents: totalDocuments,
          percentage: parseFloat(percentage.toFixed(2)),
          status_breakdown: statusCount,
          department_breakdown: departmentCount,
          recent_documents: recentDocuments
        };
      })
      .filter(item => item !== null)
      .sort((a, b) => b!.total_documents - a!.total_documents);
    
    // Apply limit and handle "Others" grouping
    const limitNum = limit ? parseInt(limit as string) : lineCodeStats.length;
    if (limitNum < lineCodeStats.length) {
      const topLineCodeStats = lineCodeStats.slice(0, limitNum);
      const otherLineCodeStats = lineCodeStats.slice(limitNum);
      
      if (otherLineCodeStats.length > 0) {
        // Combine "Others"
        const totalOtherDocuments = otherLineCodeStats.reduce((sum, item) => sum + item!.total_documents, 0);
        const otherPercentage = allProposedChanges.length > 0 ? 
          (totalOtherDocuments / allProposedChanges.length) * 100 : 0;
        
        // Combine status and department breakdowns
        const otherStatusBreakdown: { [key: string]: number } = {};
        const otherDepartmentBreakdown: { [key: string]: number } = {};
        
        otherLineCodeStats.forEach(item => {
          Object.keys(item!.status_breakdown).forEach(status => {
            otherStatusBreakdown[status] = (otherStatusBreakdown[status] || 0) + item!.status_breakdown[status];
          });
          Object.keys(item!.department_breakdown).forEach(dept => {
            otherDepartmentBreakdown[dept] = (otherDepartmentBreakdown[dept] || 0) + item!.department_breakdown[dept];
          });
        });
        
        // Recent documents from Others
        const otherRecentDocs = otherLineCodeStats
          .flatMap(item => item!.recent_documents)
          .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
          .slice(0, 5);
        
        topLineCodeStats.push({
          line_code: "Others",
          total_documents: totalOtherDocuments,
          percentage: parseFloat(otherPercentage.toFixed(2)),
          status_breakdown: otherStatusBreakdown,
          department_breakdown: otherDepartmentBreakdown,
          recent_documents: otherRecentDocs
        });
        
        lineCodeStats = topLineCodeStats;
      }
    }
    
    // Chart data
    const chartData = {
      labels: lineCodeStats.map(item => item!.line_code),
      datasets: [{
        data: lineCodeStats.map(item => item!.total_documents),
        backgroundColor: generateColors(lineCodeStats.length)
      }]
    };

    // Helper function to generate an array of distinct colors
    function generateColors(count: number): string[] {
      const baseColors = [
        "#36A2EB", "#FF6384", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40", "#C9CBCF", "#8BC34A", "#E91E63", "#00BCD4"
      ];
      const colors: string[] = [];
      for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
      }
      return colors;
    }
    
    // Summary statistics
    const summary = {
      total_documents: allProposedChanges.length,
      total_line_codes: Object.keys(lineCodeGroups).length,
      filtered_line_codes: lineCodeStats.length,
      date_range: start_date && end_date ? `${start_date} to ${end_date}` : null,
      filters_applied: {
        status: status || null,
        exclude_done: exclude_done === 'true',
        department_id: department_id ? parseInt(department_id as string) : null,
        min_documents: parseInt(min_documents as string),
        date_range: start_date && end_date ? { start_date, end_date } : null
      }
    };
    
    res.status(200).json({
      status: "success",
      message: "Line code statistics retrieved successfully",
      summary: summary,
      data: lineCodeStats,
      chart_data: chartData
    });
    
  } catch (error) {
    console.error("Error getting line code statistics:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to get line code statistics",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

// Enhanced getLineCodeStatusFlow dengan filter lengkap
export const getLineCodeStatusFlow = async (req: Request, res: Response): Promise<void> => {
  try {
    const { department_id, start_date, end_date } = req.query;
    
    console.log('📊 Getting line code flow with filters:', {
      department_id, start_date, end_date
    });

    // Build comprehensive filter condition
    const whereCondition: any = {
      is_deleted: false
    };
    
    // Filter berdasarkan department jika ada
    if (department_id) {
      whereCondition.department_id = parseInt(department_id as string);
    }

    // Add date filter dengan proper timezone handling
    if (start_date || end_date) {
      whereCondition.created_date = {};
      if (start_date) {
        const startDate = new Date(start_date as string);
        startDate.setHours(0, 0, 0, 0);
        whereCondition.created_date.gte = startDate;
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        whereCondition.created_date.lte = endDate;
      }
    }
    
    // 1. Ambil data proposed changes dengan relasi dan filter
    const proposedChanges = await prismaDB2.tr_proposed_changes.findMany({
      where: whereCondition,
      select: {
        id: true,
        line_code: true,
        status: true,
        progress: true,
        created_date: true,
        authorizationDocs: {
          select: {
            id: true,
            status: true,
            progress: true
          }
        },
        tr_handover: {
          select: {
            id: true,
            status: true,
            progress: true,
            is_finished: true
          }
        }
      }
    });
    
    console.log(`Found ${proposedChanges.length} documents matching filters`);
    
    // 2. Kelompokkan berdasarkan line_code
    const lineGroups: { [key: string]: any[] } = {};
    
    proposedChanges.forEach(doc => {
      const lineCode = doc.line_code || 'Unknown';
      
      if (!lineGroups[lineCode]) {
        lineGroups[lineCode] = [];
      }
      
      lineGroups[lineCode].push(doc);
    });
    
    // 3. Siapkan hasil dengan status flow
    const lineCodeFlowStats = Object.keys(lineGroups).map(lineCode => {
      const documents = lineGroups[lineCode];
      const totalDocuments = documents.length;
      
      // Kelompokkan dokumen berdasarkan tahapan workflow
      const workflow = {
        proposed_only: documents.filter(doc => 
          doc.authorizationDocs.length === 0 && doc.tr_handover.length === 0
        ).length,
        
        in_authorization: documents.filter(doc => 
          doc.authorizationDocs.length > 0 && doc.tr_handover.length === 0
        ).length,
        
        in_handover: documents.filter(doc => 
          doc.tr_handover.length > 0 && !doc.tr_handover.some((h: { is_finished: boolean; }) => h.is_finished === true)
        ).length,
        
        completed: documents.filter(doc => 
          doc.tr_handover.some((h: { is_finished: boolean; }) => h.is_finished === true)
        ).length
      };
      
      // Hitung persentase penyelesaian
      const completionRate = totalDocuments > 0 ? (workflow.completed / totalDocuments) * 100 : 0;
      
      // Status terperinci
      const statusCounts: { [key: string]: number } = {};
      documents.forEach(doc => {
        const status = doc.status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      
      return {
        line_code: lineCode,
        total_documents: totalDocuments,
        workflow: workflow,
        completion_rate: parseFloat(completionRate.toFixed(2)),
        status_counts: statusCounts
      };
    });
    
    // 4. Urutkan berdasarkan jumlah dokumen total
    const sortedResult = lineCodeFlowStats.sort((a, b) => b.total_documents - a.total_documents);
    
    // 5. Siapkan data chart untuk setiap tahapan workflow
    const workflowChartData = {
      labels: sortedResult.map(item => item.line_code),
      datasets: [
        {
          label: 'Proposed Only',
          data: sortedResult.map(item => item.workflow.proposed_only),
          backgroundColor: '#36A2EB' // Biru
        },
        {
          label: 'In Authorization',
          data: sortedResult.map(item => item.workflow.in_authorization),
          backgroundColor: '#FFCE56' // Kuning
        },
        {
          label: 'In Handover',
          data: sortedResult.map(item => item.workflow.in_handover),
          backgroundColor: '#FF9F40' // Oranye
        },
        {
          label: 'Completed',
          data: sortedResult.map(item => item.workflow.completed),
          backgroundColor: '#4BC0C0' // Tosca
        }
      ]
    };
    
    // 6. Hitung total dokumen per tahapan untuk ringkasan
    const totalProposedOnly = sortedResult.reduce((sum, item) => sum + item.workflow.proposed_only, 0);
    const totalInAuthorization = sortedResult.reduce((sum, item) => sum + item.workflow.in_authorization, 0);
    const totalInHandover = sortedResult.reduce((sum, item) => sum + item.workflow.in_handover, 0);
    const totalCompleted = sortedResult.reduce((sum, item) => sum + item.workflow.completed, 0);
    const grandTotal = totalProposedOnly + totalInAuthorization + totalInHandover + totalCompleted;
    
    // 7. Kirim respons
    res.status(200).json({
      status: "success",
      message: "Line code flow statistics retrieved successfully",
      summary: {
        total_documents: grandTotal,
        total_line_codes: sortedResult.length,
        workflow_summary: {
          proposed_only: totalProposedOnly,
          in_authorization: totalInAuthorization,
          in_handover: totalInHandover,
          completed: totalCompleted
        },
        completion_rate: grandTotal > 0 ? parseFloat(((totalCompleted / grandTotal) * 100).toFixed(2)) : 0,
        filters_applied: {
          department_id: department_id ? parseInt(department_id as string) : null,
          date_range: start_date && end_date ? { start_date, end_date } : null
        }
      },
      data: sortedResult,
      chart_data: workflowChartData
    });
    
  } catch (error) {
        console.error("Error getting line code flow statistics:", error);
        res.status(500).json({
          status: "error",
          message: "Failed to get line code flow statistics",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      } finally {
        await prismaDB2.$disconnect();
      }
    };