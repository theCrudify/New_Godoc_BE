
import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";


//Proposed CHnages, tapi dengan tambahan Additional Description
// Proposed CHnages, tapi dengan tambahan Additional Description + ID ID tambahan
export const SupergetProposedChangeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const numericId = Number(id);

    if (!id || isNaN(numericId)) {
      res.status(400).json({ error: "Invalid ID provided" });
      return;
    }

    const proposedChange = await prismaDB2.tr_proposed_changes.findFirst({
      where: {
        id: numericId,
        is_deleted: false
      },
      select: {
        id: true,
        project_name: true,
        document_number_id: true,
        item_changes: true,
        line_code: true,
        section_code: true,
        change_type: true,
        description: true,
        reason: true,
        cost_text: true,
        planning_start: true,
        planning_end: true,
        status: true,
        progress: true,
        created_date: true,
        created_by: true,
        updated_at: true,
        need_engineering_approval: true,
        need_production_approval: true,
        other_sytem: true,
        auth_id: true,
        section_department: {
          select: {
            id: true,
            section_name: true
          }
        },
        plant: {
          select: {
            id: true,
            plant_name: true,
            plant_code: true
          }
        },
        department: {
          select: {
            id: true,
            department_name: true,
            department_code: true
          }
        },
        documentNumber: {
          select: {
            running_number: true,
            klasifikasi_document: true,
            category: {
              select: {
                id: true,
                category: true
              }
            },
            line_code: true,
            section_code: true,
            department_code: true,
            development_code: true,
            id_proposed_header: true,
            sub_document: true,
            is_internal_memo: true,
            is_surat_ketentuan: true,
            area: {
              select: {
                id: true,
                area: true,
                code_area: true
              }
            }
          }
        }
      }
    });

    if (!proposedChange) {
      res.status(404).json({ error: "Proposed Change not found or has been deleted" });
      return;
    }

    const authorizationDoc = await prismaDB2.tr_authorization_doc.findFirst({
      where: {
        proposed_change_id: numericId
      },
      select: {
        id: true
      }
    });

    const authorization_doc_id = authorizationDoc?.id || "not yet";

    const transformedData = {
      id: proposedChange.id,
      project_name: proposedChange.project_name,
      document_number: proposedChange.documentNumber?.running_number || "",
      item_changes: proposedChange.item_changes,
      line: `Line ${proposedChange.line_code}`,
      section: proposedChange.documentNumber?.area?.area || "",
      department: proposedChange.department?.department_name || "",
      section_department: proposedChange.section_department?.id?.toString() || "",
      change_type: proposedChange.change_type,
      description: proposedChange.description,
      reason: proposedChange.reason,
      cost: proposedChange.cost_text?.replace(/\*\*/g, "").replace(/\n/g, " ") || "",
      planning_start: proposedChange.planning_start,
      planning_end: proposedChange.planning_end,
      plant: proposedChange.plant?.plant_name || "",
      created_date: proposedChange.created_date,
      created_by: proposedChange.created_by,
      updated_at: proposedChange.updated_at,
      need_engineering_approval: proposedChange.need_engineering_approval ? 1 : 0,
      need_production_approval: proposedChange.need_production_approval ? 1 : 0,
      other_sytem: proposedChange.other_sytem,
      status: proposedChange.status,
      progress: proposedChange.progress,
      area: `Line ${proposedChange.line_code} - ${proposedChange.documentNumber?.area?.area || ""}`,
      code_line: proposedChange.line_code,
      running_number: proposedChange.documentNumber?.running_number || "",
      document_category: proposedChange.documentNumber?.category?.category || "",
      klasifikasi_document: proposedChange.documentNumber?.klasifikasi_document || "",
      line_code: proposedChange.line_code,
      section_code: proposedChange.section_code,
      department_code: proposedChange.department?.department_code || "",
      development_code: proposedChange.documentNumber?.development_code || "",
      id_proposed_header: proposedChange.documentNumber?.id_proposed_header || null,
      sub_document: proposedChange.documentNumber?.sub_document || "",
      code_sub: proposedChange.documentNumber?.klasifikasi_document || "",
      is_internal_memo: proposedChange.documentNumber?.is_internal_memo || null,
      is_surat_ketentuan: proposedChange.documentNumber?.is_surat_ketentuan || null,
      id_document_number: proposedChange.document_number_id,
      development_desc: getDevelopmentDescription(proposedChange.documentNumber?.development_code || ""),
      authorization_doc_id,
      id_usulan_perubahan: 1,

      // Tambahan ID tambahan
      category_id: proposedChange.documentNumber?.category?.id || null,
      plant_id: proposedChange.plant?.id || null,
      area_id: proposedChange.documentNumber?.area?.id || null,
      section_id: proposedChange.section_department?.id || null,
      auth_id: proposedChange.auth_id || null
    };

    res.status(200).json({
      status: true,
      data: [transformedData]
    });
  } catch (error: any) {
    console.error("❌ Error in getProposedChangeById:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Fungsi untuk mendapatkan deskripsi pengembangan berdasarkan kode
function getDevelopmentDescription(code: string): string {
  const developmentMap: { [key: string]: string } = {
    "PSD": "Process Development",
    "PJD": "Project Development",
    // Tambahkan sesuai kebutuhan
  };
  return developmentMap[code] || "";
}


/**
 * Controller untuk menyisipkan document number baru
 */
export const insertDocumentNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body.form_data || {};
    console.log("===> [insertDocumentNumber] Data input:", data);

    // Validasi field yang diperlukan
    const requiredFields = [
      "klasifikasi_document",
      "plant_id"
    ];

    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
      res.status(400).json({
        error: "Validation Error",
        details: `Missing fields: ${missingFields.join(", ")}`
      });
      return;
    }

    // Konversi field boolean
    const is_internal_memo = data.is_internal_memo === true;
    const is_surat_ketentuan = data.is_surat_ketentuan === true;

    const insertData = {
      running_number: data.running_number,
      klasifikasi_document: data.klasifikasi_document,
      category_id: data.category_id ? parseInt(data.category_id) : undefined,
      plant_id: parseInt(data.plant_id),
      area_id: data.area_id ? parseInt(data.area_id) : undefined,
      section_id: data.section_id ? parseInt(data.section_id) : undefined,
      auth_id: data.auth_id ? parseInt(data.auth_id) : undefined,
      proposed_change_id: data.proposed_change_id,
      line_code: data.line_code,
      section_code: data.section_code,
      department_code: data.department_code,
      development_code: data.development_code,
      id_proposed_header: data.id_proposed_header, // Masih disimpan sebagai tambahan info jika dibutuhkan

      sub_document: data.sub_document,
      is_internal_memo,
      is_surat_ketentuan,
      created_by: data.created_by,
      created_date: data.created_date ? new Date(data.created_date) : new Date()
    };

    console.log("===> [insertDocumentNumber] Data yang akan disimpan:", insertData);

    const newDocumentNumber = await prismaDB2.tr_additional_doc.create({
      data: insertData,
      include: {
        plantsite: true,
        category: true,
        authorization: true,
        proposedChange: true
      }
    });

    console.log("===> [insertDocumentNumber] Document number berhasil dibuat dengan ID:", newDocumentNumber.id);

    res.status(201).json({
      message: "Document number created successfully",
      data: newDocumentNumber
    });

  } catch (error) {
    console.error("❌ Error creating document number:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};



/**
 * Controller untuk memperbarui document number
 */
export const updateDocumentNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Pastikan form_data selalu didefinisikan
    const data = req.body.form_data || {};

    console.log(`===> [updateDocumentNumber] Request update untuk ID: ${id}`);
    console.log(`===> [updateDocumentNumber] Data input:`, data);

    // Cek apakah document number ada
    const existing = await prismaDB2.tr_document_number.findUnique({
      where: {
        id: parseInt(id)
      }
    });

    if (!existing) {
      console.log(`❌ [updateDocumentNumber] Document number dengan ID ${id} tidak ditemukan`);
      res.status(404).json({
        error: "Not Found",
        details: `Document number with ID ${id} not found`
      });
      return;
    }

    console.log(`===> [updateDocumentNumber] Document number ditemukan dengan ID: ${id}`);
    console.log(`===> [updateDocumentNumber] Data existing:`, {
      running_number: existing.running_number,
      klasifikasi_document: existing.klasifikasi_document,
      // Tambahkan field lain yang relevan
    });

    // Siapkan data untuk update, hanya sertakan field yang ada
    const updateData: any = {};

    // Hanya sertakan field yang disediakan dalam request
    if (data.running_number !== undefined) updateData.running_number = data.running_number;
    if (data.klasifikasi_document !== undefined) updateData.klasifikasi_document = data.klasifikasi_document;
    if (data.category_id !== undefined) updateData.category_id = data.category_id ? parseInt(data.category_id) : null;
    if (data.plant_id !== undefined) updateData.plant_id = parseInt(data.plant_id);
    if (data.area_id !== undefined) updateData.area_id = data.area_id ? parseInt(data.area_id) : null;
    if (data.section_id !== undefined) updateData.section_id = data.section_id ? parseInt(data.section_id) : null;
    if (data.auth_id !== undefined) updateData.auth_id = data.auth_id ? parseInt(data.auth_id) : null;
    if (data.line_code !== undefined) updateData.line_code = data.line_code;
    if (data.section_code !== undefined) updateData.section_code = data.section_code;
    if (data.department_code !== undefined) updateData.department_code = data.department_code;
    if (data.development_code !== undefined) updateData.development_code = data.development_code;
    if (data.id_proposed_header !== undefined) updateData.id_proposed_header = data.id_proposed_header;
    if (data.sub_document !== undefined) updateData.sub_document = data.sub_document;

    // Boolean fields perlu penanganan khusus - hanya update jika disediakan
    if (data.is_internal_memo !== undefined) {
      updateData.is_internal_memo = data.is_internal_memo === true;
    }

    if (data.is_surat_ketentuan !== undefined) {
      updateData.is_surat_ketentuan = data.is_surat_ketentuan === true;
    }

    console.log(`===> [updateDocumentNumber] Data yang akan diupdate:`, updateData);

    // Jika tidak ada data untuk diupdate
    if (Object.keys(updateData).length === 0) {
      console.log(`===> [updateDocumentNumber] Tidak ada data untuk diupdate`);
      res.status(200).json({
        message: "No data to update",
        data: existing
      });
      return;
    }

    // Update document number
    const updatedDocumentNumber = await prismaDB2.tr_document_number.update({
      where: {
        id: parseInt(id)
      },
      data: updateData,
      include: {
        plant: true,
        area: true,
        category: true,
        section: true,
        authorization: true
      }
    });

    console.log(`===> [updateDocumentNumber] Document number berhasil diupdate dengan ID: ${updatedDocumentNumber.id}`);
    console.log(`===> [updateDocumentNumber] Data setelah update:`, {
      running_number: updatedDocumentNumber.running_number,
      klasifikasi_document: updatedDocumentNumber.klasifikasi_document,
      // Tambahkan field lain yang relevan
    });

    res.status(200).json({
      message: "Document number updated successfully",
      data: updatedDocumentNumber
    });

  } catch (error) {
    console.error(`❌ Error updating document number:`, error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

// Fungsi untuk mendapatkan semua dokumen tambahan berdasarkan proposed_change_id
export const searchByProposedChangeId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { proposed_change_id } = req.query;

    if (!proposed_change_id) {
      res.status(400).json({
        status: false,
        message: "Validation Error",
        details: "proposed_change_id is required"
      });
      return;
    }

    // Konversi ke integer karena field di database adalah integer
    const proposedChangeIdInt = parseInt(proposed_change_id as string, 10);

    if (isNaN(proposedChangeIdInt)) {
      res.status(400).json({
        status: false,
        message: "Validation Error",
        details: "proposed_change_id must be a valid number"
      });
      return;
    }

    console.log(`Searching for documents with proposed_change_id: ${proposedChangeIdInt}`);

    const documents = await prismaDB2.tr_additional_doc.findMany({
      where: {
        proposed_change_id: proposedChangeIdInt
      },
      include: {
        plantsite: true,
        // category: true,
        authorization: true,
        // proposedChange: true
      },
      orderBy: {
        created_date: 'desc'
      }
    });

    // Log untuk debugging
    console.log(`Found ${documents.length} documents`);

    if (documents.length === 0) {
      res.status(200).json({
        status: true,
        message: "No documents found with the provided proposed_change_id",
        data: [],
        count: 0
      });
      return;
    }

    // Ambil file untuk setiap dokumen
    const documentsWithFiles = await Promise.all(
      documents.map(async (doc) => {
        // Ambil hanya file versi terbaru dari tr_additional_file berdasarkan tr_additional_doc_id
        const latestFile = await prismaDB2.tr_additional_file.findFirst({
          where: {
            tr_additional_doc_id: doc.id,
            is_deleted: false
          },
          orderBy: {
            version: 'desc'
          }
        });

        // Gabungkan dokumen dengan file versi terbaru
        return {
          ...doc,
          file: latestFile || null
        };
      })
    );

    res.status(200).json({
      status: true,
      message: "Documents retrieved successfully",
      data: documentsWithFiles,
      count: documents.length
    });

  } catch (error) {
    console.error("❌ Error searching documents by proposed_change_id:", error);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};