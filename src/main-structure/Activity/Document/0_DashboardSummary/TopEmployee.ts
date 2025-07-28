import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";

/**
 * Get top handover submitters by document count and average rating
 * Enhanced dengan department filter support
 */
export const getTopHandoverSubmitters = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 10;
    const dateFrom = req.query.date_from ? new Date(req.query.date_from as string) : undefined;
    const dateTo = req.query.date_to ? new Date(req.query.date_to as string) : undefined;
    const minRating = req.query.min_rating ? parseFloat(req.query.min_rating as string) : undefined;
    const minDocuments = parseInt(req.query.min_documents as string) || 1;
    // NEW: Department filter support
    const departmentId = req.query.department_id ? parseInt(req.query.department_id as string) : undefined;

    console.log(`Getting top ${limit} submitters with filters:`, {
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
      minRating,
      minDocuments,
      departmentId // Log department filter
    });

    // Enhanced date filter dengan proper timezone
    const dateFilter: any = {};
    if (dateFrom) {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      dateFilter.gte = startDate;
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }

    // Build comprehensive where condition
    const where: any = {
      is_deleted: false,
      is_finished: true,
      star: { not: null },
    };

    // Add date filter
    if (Object.keys(dateFilter).length) {
      where.created_date = dateFilter;
    }

    // Add minimum rating filter
    if (minRating !== undefined) {
      where.star = { ...where.star, gte: minRating };
    }

    // NEW: Add department filter
    if (departmentId) {
      where.department_id = departmentId;
      console.log(`Filtering by department_id: ${departmentId}`);
    }

    // Get grouped results dengan department filter
    const grouped = await prismaDB2.tr_handover.groupBy({
      by: ["auth_id"],
      where,
      _count: { id: true },
      _avg: { star: true },
    });

    console.log(`Found ${grouped.length} submitters before filtering`);

    // Filter by minimum documents
    const filtered = grouped.filter(g => g.auth_id && g._count.id >= minDocuments);

    console.log(`${filtered.length} submitters meet minimum ${minDocuments} documents`);

    // Get detailed information for each submitter
    const submitters = await Promise.all(filtered.map(async (g) => {
      const user = await prismaDB2.mst_authorization.findUnique({
        where: { id: g.auth_id! },
        select: {
          id: true,
          employee_code: true,
          employee_name: true,
          email: true,
          department: { 
            select: { 
              id: true,
              department_code: true, 
              department_name: true 
            } 
          },
        }
      });
      
      if (!user) return null;

      // Get handover details dengan filter yang sama
      const handoverWhere: any = {
        auth_id: g.auth_id!,
        is_deleted: false,
        is_finished: true,
        star: { not: null },
      };

      // Apply same filters to handover details
      if (Object.keys(dateFilter).length) {
        handoverWhere.created_date = dateFilter;
      }
      if (departmentId) {
        handoverWhere.department_id = departmentId;
      }

      const handovers = await prismaDB2.tr_handover.findMany({
        where: handoverWhere,
        select: {
          id: true,
          doc_number: true,
          star: true,
          finished_date: true,
          tr_proposed_changes: { select: { project_name: true } },
        },
        orderBy: { star: "desc" },
      });

      const best = handovers[0] || null;
      const worst = handovers.reduce((min, h) => (!min || (h.star ?? 0) < (min.star ?? 0)) ? h : min, best);

      return {
        user,
        stats: {
          total_handovers: g._count.id,
          average_rating: parseFloat((g._avg.star ?? 0).toFixed(2)),
          best_rating: best?.star ?? 0,
          worst_rating: worst?.star ?? 0,
        },
        best_handover: best && {
          id: best.id,
          doc_number: best.doc_number,
          rating: best.star,
          project_name: best.tr_proposed_changes?.project_name || "Unknown",
          finished_date: best.finished_date,
        },
        worst_handover: worst && worst.id !== best?.id ? {
          id: worst.id,
          doc_number: worst.doc_number,
          rating: worst.star,
          project_name: worst.tr_proposed_changes?.project_name || "Unknown",
          finished_date: worst.finished_date,
        } : null
      };
    }));

    // Sort by rating then by total handovers
    const sorted = submitters.filter(Boolean).sort((a, b) => {
      return b!.stats.average_rating - a!.stats.average_rating || 
             b!.stats.total_handovers - a!.stats.total_handovers;
    });

    // Enhanced response dengan department info
    res.status(200).json({
      status: "success",
      message: `Top ${limit} handover submitters berhasil diambil`,
      filters: { 
        date_from: dateFrom?.toISOString() || null, 
        date_to: dateTo?.toISOString() || null, 
        department_id: departmentId || null, // NEW: Include department in response
        min_rating: minRating, 
        min_documents: minDocuments, 
        limit 
      },
      summary: {
        total_candidates: grouped.length,
        filtered_candidates: filtered.length,
        returned_results: Math.min(limit, sorted.length)
      },
      data: sorted.slice(0, limit).map((d, i) => ({ rank: i + 1, ...d })),
    });

  } catch (err) {
    console.error("Error getting top handover submitters:", err);
    res.status(500).json({
      status: "error",
      message: "Gagal mengambil data top handover submitters",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Get top handover approvers by approval count and average rating
 * Enhanced dengan department filter support
 */
export const getTopHandoverApprovers = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 10;
    const dateFrom = req.query.date_from ? new Date(req.query.date_from as string) : undefined;
    const dateTo = req.query.date_to ? new Date(req.query.date_to as string) : undefined;
    const minDocuments = parseInt(req.query.min_documents as string) || 1;
    // NEW: Department filter support
    const departmentId = req.query.department_id ? parseInt(req.query.department_id as string) : undefined;

    console.log(`Getting top ${limit} approvers with filters:`, {
      dateFrom: dateFrom?.toISOString(),
      dateTo: dateTo?.toISOString(),
      minDocuments,
      departmentId // Log department filter
    });

    // Enhanced date filter dengan proper timezone
    const dateFilter: any = {};
    if (dateFrom) {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      dateFilter.gte = startDate;
    }
    if (dateTo) {
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.lte = endDate;
    }

    // Build where condition for approvals
    const where: any = {
      status: 'approved',
      rating: { not: null }
    };

    // Add handover date filter if specified
    if (Object.keys(dateFilter).length > 0) {
      where.tr_handover = {
        created_date: dateFilter,
        // NEW: Add department filter untuk handover
        ...(departmentId ? { department_id: departmentId } : {})
      };
    } else if (departmentId) {
      // If no date filter but department filter exists
      where.tr_handover = {
        department_id: departmentId
      };
    }

    // Get grouped approver statistics
    const grouped = await prismaDB2.tr_handover_approval.groupBy({
      by: ['auth_id'],
      where,
      _count: { id: true },
      _avg: { rating: true }
    });

    console.log(`Found ${grouped.length} approvers before filtering`);

    // Filter by minimum documents and exclude null auth_id
    const filtered = grouped.filter(item => 
      item._count.id >= minDocuments && item.auth_id !== null
    );

    console.log(`${filtered.length} approvers meet minimum ${minDocuments} documents`);

    // Get detailed information for each approver
    const approvers = await Promise.all(filtered.map(async (item) => {
      if (!item.auth_id) return null;

      // Get user details
      const user = await prismaDB2.mst_authorization.findUnique({
        where: { id: item.auth_id },
        select: {
          id: true,
          employee_code: true,
          employee_name: true,
          email: true,
          department: {
            select: {
              id: true,
              department_name: true,
              department_code: true
            }
          }
        }
      });

      if (!user) return null;

      // Get approval details dengan filter yang sama
      const approvalWhere: any = {
        auth_id: item.auth_id,
        status: 'approved',
        rating: { not: null }
      };

      // Apply same filters to approval details
      if (Object.keys(dateFilter).length > 0 || departmentId) {
        approvalWhere.tr_handover = {};
        if (Object.keys(dateFilter).length > 0) {
          approvalWhere.tr_handover.created_date = dateFilter;
        }
        if (departmentId) {
          approvalWhere.tr_handover.department_id = departmentId;
        }
      }

      const approvals = await prismaDB2.tr_handover_approval.findMany({
        where: approvalWhere,
        select: {
          id: true,
          rating: true,
          review: true,
          updated_date: true,
          tr_handover: {
            select: {
              id: true,
              doc_number: true,
              tr_proposed_changes: {
                select: {
                  project_name: true
                }
              }
            }
          }
        },
        orderBy: { rating: 'desc' }
      });

      // Get highest and lowest ratings
      const highest = approvals[0] || null;
      const lowest = approvals.reduce((min, curr) => 
        (!min || (curr.rating || 0) < (min.rating || 0)) ? curr : min
      , highest);

      return {
        user,
        stats: {
          total_approvals: item._count.id,
          average_rating: parseFloat((item._avg.rating ?? 0).toFixed(2)),
          highest_rating: highest?.rating ?? 0,
          lowest_rating: lowest?.rating ?? 0,
        },
        highest_rated: highest && {
          id: highest.id,
          handover_id: highest.tr_handover?.id,
          doc_number: highest.tr_handover?.doc_number,
          rating: highest.rating,
          review: highest.review,
          project_name: highest.tr_handover?.tr_proposed_changes?.project_name || "Unknown",
          rated_date: highest.updated_date,
        },
        lowest_rated: lowest && lowest.id !== highest?.id ? {
          id: lowest.id,
          handover_id: lowest.tr_handover?.id,
          doc_number: lowest.tr_handover?.doc_number,
          rating: lowest.rating,
          review: lowest.review,
          project_name: lowest.tr_handover?.tr_proposed_changes?.project_name || "Unknown",
          rated_date: lowest.updated_date,
        } : null
      };
    }));

    // Sort by average rating then by total approvals
    const sorted = approvers.filter(Boolean).sort((a, b) => {
      return b!.stats.average_rating - a!.stats.average_rating || 
             b!.stats.total_approvals - a!.stats.total_approvals;
    });

    // Enhanced response dengan department info
    res.status(200).json({
      status: "success",
      message: `Top ${limit} handover approvers berhasil diambil`,
      filters: {
        date_from: dateFrom?.toISOString() || null,
        date_to: dateTo?.toISOString() || null,
        department_id: departmentId || null, // NEW: Include department in response
        min_documents: minDocuments,
        limit: limit
      },
      summary: {
        total_candidates: grouped.length,
        filtered_candidates: filtered.length,
        returned_results: Math.min(limit, sorted.length)
      },
      data: sorted.slice(0, limit).map((item, index) => ({
        rank: index + 1,
        ...item
      }))
    });

  } catch (error) {
    console.error("Error getting top handover approvers:", error);
    res.status(500).json({
      status: "error",
      message: "Gagal mengambil data top handover approvers",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};


