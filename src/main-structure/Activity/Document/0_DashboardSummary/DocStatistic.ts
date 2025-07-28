import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, startOfHour, endOfHour, format, subMonths, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';

/**
 * Mendapatkan statistik pembuatan dokumen berdasarkan waktu
 * Mendukung filter: bulan, minggu, hari, jam
 * Bisa difilter per rentang tanggal custom
 */
export const getDocumentTimeStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Extract query parameters
    const {
      period = 'daily', // Default: daily (options: monthly, weekly, daily, hourly)
      start_date,       // Format: YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
      end_date,         // Format: YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
      department_id,    // Optional: Filter by department
      month,            // Optional: Filter by month (1-12)
      year = new Date().getFullYear(), // Default to current year if not specified
    } = req.query;

    console.log(`Mendapatkan statistik dokumen dengan period: ${period}`);
    
    // 2. Determine date range
    let startDate: Date;
    let endDate: Date;
    
    // If specific start_date and end_date are provided, use them
    if (start_date && end_date) {
      startDate = parseISO(start_date as string);
      endDate = parseISO(end_date as string);
      console.log(`Menggunakan rentang waktu custom: ${format(startDate, 'dd MMM yyyy HH:mm:ss')} - ${format(endDate, 'dd MMM yyyy HH:mm:ss')}`);
    } 
    // If month is specified, get that month's range
    else if (month) {
      const monthNum = parseInt(month as string);
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        res.status(400).json({
          status: "error",
          message: "Bulan harus berupa angka 1-12"
        });
        return;
      }
      
      // Create date for the first day of the specified month
      const yearNum = parseInt(year as string);
      const monthDate = new Date(yearNum, monthNum - 1, 1); // month is 0-indexed in JS
      
      startDate = startOfMonth(monthDate);
      endDate = endOfMonth(monthDate);
      
      console.log(`Menggunakan bulan ${monthNum}/${yearNum}: ${format(startDate, 'dd MMM yyyy')} - ${format(endDate, 'dd MMM yyyy')}`);
    }
    // Otherwise, use last 6 months as default
    else {
      endDate = new Date();
      startDate = subMonths(endDate, 6);
      console.log(`Menggunakan 6 bulan terakhir: ${format(startDate, 'dd MMM yyyy')} - ${format(endDate, 'dd MMM yyyy')}`);
    }
    
    // 3. Add department filter if provided
    const departmentFilter = department_id ? 
      { department_id: parseInt(department_id as string) } : {};
    
    // 4. Fetch data for each document type
    
    // 4.1 Proposed Changes
    const proposedChanges = await prismaDB2.tr_proposed_changes.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        is_deleted: false,
        ...departmentFilter
      },
      select: {
        id: true,
        created_date: true,
        status: true,
        department_id: true,
        department: {
          select: {
            department_name: true
          }
        }
      },
      orderBy: {
        created_date: 'asc'
      }
    });
    
    // 4.2 Authorization Documents
    const authDocs = await prismaDB2.tr_authorization_doc.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        ...departmentFilter
      },
      select: {
        id: true,
        created_date: true,
        status: true,
        department_id: true,
        department: {
          select: {
            department_name: true
          }
        }
      },
      orderBy: {
        created_date: 'asc'
      }
    });
    
    // 4.3 Handover Documents
    const handovers = await prismaDB2.tr_handover.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        is_deleted: false,
        ...departmentFilter
      },
      select: {
        id: true,
        created_date: true,
        status: true,
        is_finished: true,
        finished_date: true,
        department_id: true,
   
      },
      orderBy: {
        created_date: 'asc'
      }
    });
    
    console.log(`Ditemukan: ${proposedChanges.length} proposed changes, ${authDocs.length} authorization docs, ${handovers.length} handovers`);
    
    // 5. Group data by time period
    const groupedData = groupDocumentsByTimePeriod(
      proposedChanges, 
      authDocs, 
      handovers, 
      period as string,
      startDate,
      endDate
    );
    
    // 6. Calculate summary statistics
    const summary = {
      total_proposed_changes: proposedChanges.length,
      total_authorization_docs: authDocs.length,
      total_handovers: handovers.length,
      total_completed: handovers.filter(h => h.is_finished).length,
      
      department_summary: summarizeByDepartment(proposedChanges, authDocs, handovers),
      status_summary: {
        proposed_changes: summarizeByStatus(proposedChanges),
        authorization_docs: summarizeByStatus(authDocs),
        handovers: summarizeByStatus(handovers),
      }
    };
    
    // 7. Send response
    res.status(200).json({
      status: "success",
      message: "Statistik dokumen berhasil diambil",
      period: period,
      date_range: {
        start: format(startDate, 'yyyy-MM-dd HH:mm:ss'),
        end: format(endDate, 'yyyy-MM-dd HH:mm:ss')
      },
      summary: summary,
      data: groupedData
    });
    
  } catch (error) {
    console.error("Error saat mengambil statistik dokumen:", error);
    res.status(500).json({
      status: "error",
      message: "Gagal mengambil statistik dokumen",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Fungsi untuk mengelompokkan dokumen berdasarkan periode waktu
 */
function groupDocumentsByTimePeriod(
  proposedChanges: any[],
  authDocs: any[],
  handovers: any[],
  period: string,
  startDate: Date,
  endDate: Date
): any[] {
  // Mapping untuk format tampilan berdasarkan periode
  const periodFormats: {[key: string]: string} = {
    'monthly': 'MMMM yyyy',
    'weekly': "'Week' w, yyyy",
    'daily': 'EEEE, dd MMMM yyyy',
    'hourly': 'HH:00, EEEE dd MMMM yyyy'
  };
  
  // Function to get period key for a date
  const getPeriodKey = (date: Date): string => {
    switch (period) {
      case 'monthly':
        return format(date, 'yyyy-MM');
      case 'weekly':
        return `${format(date, 'yyyy')}-W${format(date, 'ww')}`;
      case 'daily':
        return format(date, 'yyyy-MM-dd');
      case 'hourly':
        return format(date, 'yyyy-MM-dd HH');
      default:
        return format(date, 'yyyy-MM-dd');
    }
  };
  
  // Function to get formatted display date
  const getDisplayDate = (date: Date): string => {
    return format(date, periodFormats[period] || 'dd MMM yyyy', { locale: id });
  };
  
  // Generate all period keys in range
  const allPeriodKeys: {[key: string]: string} = {};
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const key = getPeriodKey(currentDate);
    allPeriodKeys[key] = getDisplayDate(currentDate);
    
    // Advance to next period
    switch (period) {
      case 'monthly':
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        break;
      case 'weekly':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'daily':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case 'hourly':
        currentDate.setHours(currentDate.getHours() + 1);
        break;
      default:
        currentDate.setDate(currentDate.getDate() + 1);
    }
  }
  
  // Initialize result with all periods
  const result: {[key: string]: any} = {};
  
  Object.keys(allPeriodKeys).forEach(key => {
    result[key] = {
      period_key: key,
      period_label: allPeriodKeys[key],
      proposed_changes: {
        created: 0,
        documents: []
      },
      authorization_docs: {
        created: 0,
        documents: []
      },
      handovers: {
        created: 0,
        completed: 0,
        documents: []
      }
    };
  });
  
  // Group proposed changes
  proposedChanges.forEach(pc => {
    if (!pc.created_date) return;
    
    const key = getPeriodKey(new Date(pc.created_date));
    if (result[key]) {
      result[key].proposed_changes.created++;
      result[key].proposed_changes.documents.push({
        id: pc.id,
        created_date: pc.created_date,
        status: pc.status,
        department_id: pc.department_id,
        department_name: pc.department?.department_name || 'Unknown'
      });
    }
  });
  
  // Group authorization docs
  authDocs.forEach(auth => {
    if (!auth.created_date) return;
    
    const key = getPeriodKey(new Date(auth.created_date));
    if (result[key]) {
      result[key].authorization_docs.created++;
      result[key].authorization_docs.documents.push({
        id: auth.id,
        created_date: auth.created_date,
        status: auth.status,
        department_id: auth.department_id,
        department_name: auth.department?.department_name || 'Unknown'
      });
    }
  });
  
  // Group handovers
  handovers.forEach(h => {
    if (!h.created_date) return;
    
    const createdKey = getPeriodKey(new Date(h.created_date));
    if (result[createdKey]) {
      result[createdKey].handovers.created++;
      
      // Also count completed if applicable
      if (h.is_finished && h.finished_date) {
        const completedKey = getPeriodKey(new Date(h.finished_date));
        if (result[completedKey]) {
          result[completedKey].handovers.completed++;
        }
      }
      
      result[createdKey].handovers.documents.push({
        id: h.id,
        created_date: h.created_date,
        finished_date: h.finished_date,
        status: h.status,
        is_finished: h.is_finished,
        department_id: h.department_id,
        department_name: h.department?.department_name || 'Unknown'
      });
    }
  });
  
  // Convert to array and sort
  return Object.values(result).sort((a, b) => a.period_key.localeCompare(b.period_key));
}

/**
 * Menghitung ringkasan dokumen berdasarkan departemen
 */
function summarizeByDepartment(
  proposedChanges: any[],
  authDocs: any[],
  handovers: any[]
): any[] {
  // Create department map to store counts
  const departmentMap: {[key: string]: any} = {};
  
  // Count proposed changes by department
  proposedChanges.forEach(pc => {
    const deptId = pc.department_id;
    const deptName = pc.department?.department_name || 'Unknown';
    
    if (!departmentMap[deptId]) {
      departmentMap[deptId] = {
        department_id: deptId,
        department_name: deptName,
        proposed_changes: 0,
        authorization_docs: 0,
        handovers: 0,
        completed: 0
      };
    }
    
    departmentMap[deptId].proposed_changes++;
  });
  
  // Count authorization docs by department
  authDocs.forEach(auth => {
    const deptId = auth.department_id;
    const deptName = auth.department?.department_name || 'Unknown';
    
    if (!departmentMap[deptId]) {
      departmentMap[deptId] = {
        department_id: deptId,
        department_name: deptName,
        proposed_changes: 0,
        authorization_docs: 0,
        handovers: 0,
        completed: 0
      };
    }
    
    departmentMap[deptId].authorization_docs++;
  });
  
  // Count handovers by department
  handovers.forEach(h => {
    const deptId = h.department_id;
    const deptName = h.department?.department_name || 'Unknown';
    
    if (!departmentMap[deptId]) {
      departmentMap[deptId] = {
        department_id: deptId,
        department_name: deptName,
        proposed_changes: 0,
        authorization_docs: 0,
        handovers: 0,
        completed: 0
      };
    }
    
    departmentMap[deptId].handovers++;
    
    if (h.is_finished) {
      departmentMap[deptId].completed++;
    }
  });
  
  // Convert to array and sort by proposed changes count (descending)
  return Object.values(departmentMap).sort((a, b) => b.proposed_changes - a.proposed_changes);
}

/**
 * Menghitung ringkasan dokumen berdasarkan status
 */
function summarizeByStatus(documents: any[]): any {
  const statusMap: {[key: string]: number} = {};
  
  documents.forEach(doc => {
    const status = doc.status || 'unknown';
    statusMap[status] = (statusMap[status] || 0) + 1;
  });
  
  return statusMap;
}

/**
 * Mendapatkan tren pembuatan dokumen untuk dashboard
 * Dibuat sederhana dengan jumlah per bulan selama 12 bulan terakhir
 */
export const getDocumentTrends = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Calculate date range: last 12 months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 11); // 12 months including current
    startDate.setDate(1); // Start from first day of month
    startDate.setHours(0, 0, 0, 0);
    
    endDate.setMonth(endDate.getMonth() + 1); // Include current month completely
    endDate.setDate(0); // Last day of current month
    endDate.setHours(23, 59, 59, 999);
    
    console.log(`Mengambil tren dokumen dari ${format(startDate, 'MMMM yyyy')} sampai ${format(endDate, 'MMMM yyyy')}`);
    
    // 2. Department filter if provided
    const departmentId = req.query.department_id ? 
      parseInt(req.query.department_id as string) : undefined;
    
    const departmentFilter = departmentId ? 
      { department_id: departmentId } : {};
    
    // 3. Fetch data for the charts
    
    // 3.1 Monthly document creation counts
    const proposedChanges = await prismaDB2.tr_proposed_changes.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        is_deleted: false,
        ...departmentFilter
      },
      select: {
        created_date: true
      }
    });
    
    const authDocs = await prismaDB2.tr_authorization_doc.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        ...departmentFilter
      },
      select: {
        created_date: true
      }
    });
    
    const handovers = await prismaDB2.tr_handover.findMany({
      where: {
        created_date: {
          gte: startDate,
          lte: endDate
        },
        is_deleted: false,
        ...departmentFilter
      },
      select: {
        created_date: true,
        is_finished: true,
        finished_date: true
      }
    });
    
    // 4. Group by month
    const monthlyData = prepareMonthlyData(
      startDate,
      endDate,
      proposedChanges,
      authDocs,
      handovers
    );
    
    // 5. Send response
    res.status(200).json({
      status: "success",
      message: "Tren dokumen berhasil diambil",
      date_range: {
        start: format(startDate, 'MMMM yyyy', { locale: id }),
        end: format(endDate, 'MMMM yyyy', { locale: id })
      },
      department_id: departmentId,
      data: monthlyData
    });
    
  } catch (error) {
    console.error("Error saat mengambil tren dokumen:", error);
    res.status(500).json({
      status: "error",
      message: "Gagal mengambil tren dokumen",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Menyiapkan data bulanan untuk tren dokumen
 */
function prepareMonthlyData(
  startDate: Date,
  endDate: Date,
  proposedChanges: any[],
  authDocs: any[],
  handovers: any[]
): any[] {
  // Generate all months in the range
  const months: {[key: string]: any} = {};
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const monthKey = format(currentDate, 'yyyy-MM');
    months[monthKey] = {
      month_key: monthKey,
      month: format(currentDate, 'MMMM', { locale: id }),
      year: format(currentDate, 'yyyy'),
      proposed_changes: 0,
      authorization_docs: 0,
      handovers: 0,
      completed: 0
    };
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Count documents by month
  proposedChanges.forEach(doc => {
    if (!doc.created_date) return;
    
    const monthKey = format(new Date(doc.created_date), 'yyyy-MM');
    if (months[monthKey]) {
      months[monthKey].proposed_changes++;
    }
  });
  
  authDocs.forEach(doc => {
    if (!doc.created_date) return;
    
    const monthKey = format(new Date(doc.created_date), 'yyyy-MM');
    if (months[monthKey]) {
      months[monthKey].authorization_docs++;
    }
  });
  
  handovers.forEach(doc => {
    if (!doc.created_date) return;
    
    // Count created handovers
    const createdMonthKey = format(new Date(doc.created_date), 'yyyy-MM');
    if (months[createdMonthKey]) {
      months[createdMonthKey].handovers++;
    }
    
    // Count completed handovers
    if (doc.is_finished && doc.finished_date) {
      const finishedMonthKey = format(new Date(doc.finished_date), 'yyyy-MM');
      if (months[finishedMonthKey]) {
        months[finishedMonthKey].completed++;
      }
    }
  });
  
  // Convert to array and sort by month
  return Object.values(months).sort((a, b) => a.month_key.localeCompare(b.month_key));
}