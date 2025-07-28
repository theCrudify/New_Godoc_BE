import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

/**
 * Enhanced getDocumentStatusMapping dengan comprehensive filters
 */
async function getDocumentStatusMapping(req: Request, res: Response) {
  try {
    // Extract filter parameters dari frontend
    const { 
      start_date, 
      end_date, 
      department_id 
    } = req.query;
    
    console.log('📊 Getting document status mapping with filters:', {
      start_date, end_date, department_id
    });

    // Build base filter untuk proposed changes dengan date handling
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
        console.log(`Filter from date: ${startDate.toISOString()}`);
      }
      if (end_date) {
        const endDate = new Date(end_date as string);
        endDate.setHours(23, 59, 59, 999);
        baseFilter.created_date.lte = endDate;
        console.log(`Filter to date: ${endDate.toISOString()}`);
      }
    }

    // Add department filter
    if (department_id) {
      baseFilter.department_id = parseInt(department_id as string);
      console.log(`Filter by department_id: ${department_id}`);
    }

    // Get total active documents dengan filter
    const totalDocuments = await prismaDB2.tr_proposed_changes.count({
      where: baseFilter
    });

    console.log(`Total documents matching filters: ${totalDocuments}`);

    // Get documents still in proposed_changes stage (no authorization doc yet)
    const proposedChangesStage = await prismaDB2.tr_proposed_changes.count({
      where: {
        ...baseFilter,
        authorizationDocs: {
          none: {}
        }
      }
    });

    // Get documents in authorization stage (have auth doc but not in handover)
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

    // Get documents in handover stage (not finished) dengan enhanced filtering
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

    // Get completed documents dengan enhanced filtering
    const completedFilter: any = {
      is_deleted: false,
      is_finished: true
    };

    // Add department filter untuk completed
    if (department_id) {
      completedFilter.department_id = parseInt(department_id as string);
    }

    // Add date filter untuk completed - use finished_date for completed documents
    if (start_date || end_date) {
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

    // Calculate percentages for better insights
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

    // Calculate workflow efficiency metrics
    const inProgressDocuments = proposedChangesStage + authorizationStage + handoverStage;
    const workflowEfficiency = totalDocuments > 0 ? 
      Math.round((completedDocuments / totalDocuments) * 100) : 0;

    // Enhanced response dengan comprehensive data
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
      metrics: {
        in_progress: inProgressDocuments,
        workflow_efficiency: workflowEfficiency,
        growth_rate: growthRate,
        previous_period_total: previousPeriodTotal
      },
      filters: {
        date_range: start_date && end_date ? `${start_date} to ${end_date}` : null,
        department_id: department_id ? parseInt(department_id as string) : null,
        has_filters: !!(start_date || end_date || department_id)
      },
      summary: {
        message: totalDocuments > 0 ? 
          `Found ${totalDocuments} documents matching filters` : 
          "No documents found matching the specified filters",
        breakdown: {
          proposed_changes: `${proposedChangesStage} documents (${calculatePercentage(proposedChangesStage, totalDocuments)}%)`,
          authorization: `${authorizationStage} documents (${calculatePercentage(authorizationStage, totalDocuments)}%)`,
          handover: `${handoverStage} documents (${calculatePercentage(handoverStage, totalDocuments)}%)`,
          completed: `${completedDocuments} documents (${calculatePercentage(completedDocuments, totalDocuments)}%)`
        }
      }
    });

    console.log(`✅ Document status mapping completed: ${totalDocuments} total, ${completedDocuments} completed`);

  } catch (error) {
    console.error("Error fetching document mapping:", error);
    res.status(500).json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
      message: "Failed to fetch document status mapping"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
}

export { getDocumentStatusMapping };