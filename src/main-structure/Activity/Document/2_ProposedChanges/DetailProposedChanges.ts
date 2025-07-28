import fs from "fs";
import sharp from "sharp";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import path from "path";

import mime from 'mime-types';

const uploadsDir = path.join(process.cwd(), "src", "uploads");




export const getSupportDocumentByProposedId = async (req: Request, res: Response): Promise<void> => {
  try {
    const proposedChangesId = Number(req.params.id);

    if (isNaN(proposedChangesId)) {
      res.status(400).json({ error: "Invalid proposed_id" });
      return;
    }

    const approvals = await prismaDB2.tbl_support_document.findMany({
      where: {
        proposed_id: proposedChangesId,
      },
      // include: {
      //   proposedChange: true,       // relasi ke tr_proposed_changes
      // },
      orderBy: {
        created_date: "desc",
      },
    });

    if (approvals.length === 0) {
      res.status(404).json({
        message: `No approval history found for proposed_id ${proposedChangesId}`,
      });
      return;
    }

    res.status(200).json({ data: approvals });
  } catch (error) {
    console.error("Error fetching approval history by proposed_id:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getProposedChangeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const numericId = Number(id); // Konversi ID ke number

    if (!id || isNaN(numericId)) { // Validasi ID adalah angka
      res.status(400).json({ error: "Invalid ID provided" });
      return;
    }

    // Gunakan findFirst untuk menambahkan kondisi is_deleted
    const proposedChange = await prismaDB2.tr_proposed_changes.findFirst({
      where: {
        id: numericId,        // Cari berdasarkan ID
        is_deleted: false   // <-- DAN is_deleted harus false
      },
      include: { // Include relasi yang dibutuhkan
        plant: true,
        department: true,
        section_department: true,
        documentNumber: true
        // Tambahkan include lain jika perlu
      }
    });

    // Jika tidak ditemukan (baik karena ID salah atau sudah di-soft delete)
    if (!proposedChange) {
      res.status(404).json({ error: "Proposed Change not found or has been deleted" });
      return;
    }

    // Format response (mapping opsional)
    // const formattedData = {
    //     ...proposedChange,
    //     plant_details: proposedChange.plant ?? null,
    //     department_details: proposedChange.department ?? null,
    //     section_department_details: proposedChange.section_department ?? null,
    //     document_number_details: proposedChange.documentNumber ?? null
    // };

    res.status(200).json({
      // data: [formattedData], // Jika menggunakan mapping
      data: [proposedChange], // Kirim data asli jika mapping tidak perlu
      // Pagination untuk getById biasanya berisi 1 item
      pagination: {
        totalCount: 1,
        totalPages: 1,
        currentPage: 1,
        limit: 1,
        hasNextPage: false,
        hasPreviousPage: false
      }
    });
  } catch (error: any) { // Tangkap error dengan tipe any atau unknown
    console.error("❌ Error in getProposedChangeById:", error);
    res.status(500).json({
      error: "Internal Server Error",
      // Kirim detail error hanya di development jika perlu
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateSupportDocumentTitle = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const bodyArray = req.body;

    if (!id) {
      console.warn("Update title failed: ID is missing");
      res.status(400).json({ error: "ID is required" });
      return;
    }

    if (!Array.isArray(bodyArray) || bodyArray.length === 0) {
      console.warn(`Update title failed: Body is not a valid array. Body: ${JSON.stringify(bodyArray)}`);
      res.status(400).json({ error: "Request body must be a non-empty array" });
      return;
    }

    const { title } = bodyArray[0];

    if (!title) {
      console.warn("Update title failed: Title is missing in body[0]");
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const existingDocument = await prismaDB2.tbl_support_document.findUnique({
      where: { id: Number(id) },
    });

    if (!existingDocument || existingDocument.is_deleted) {
      console.warn(`Update title failed: Document with ID ${id} not found or deleted`);
      res.status(404).json({ error: "Support Document not found" });
      return;
    }

    const updatedDocument = await prismaDB2.tbl_support_document.update({
      where: { id: Number(id) },
      data: { title },
    });

    console.log(`Title updated for document ID ${id} => ${title}`);

    res.status(200).json({
      message: "Support Document title updated successfully",
      data: updatedDocument,
    });
  } catch (error) {
    console.error(`Error updating title for document ID ${req.params.id}:`, error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createSupportDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const {
    support_doc_id,
    created_by,
    updated_by,
  } = req.body;

  try {
    if (!support_doc_id || !req.file) {
      console.warn("Create file failed: Missing support_doc_id or file");
      res.status(400).json({ message: "support_doc_id and file are required" });
      return;
    }

    const supportDoc = await prismaDB2.tbl_support_document.findUnique({
      where: { id: Number(support_doc_id) },
    });

    if (!supportDoc || supportDoc.is_deleted) {
      console.warn(`Document with ID ${support_doc_id} not found or deleted`);
      res.status(404).json({ message: "Support document not found" });
      return;
    }

    const lastVersion = await prismaDB2.tbl_support_document_file.findFirst({
      where: {
        support_doc_id: Number(support_doc_id),
        is_deleted: false,
      },
      orderBy: {
        version: "desc",
      },
    });

    const newVersion = lastVersion ? lastVersion.version + 1 : 1;

    const newFile = await prismaDB2.tbl_support_document_file.create({
      data: {
        support_doc_id: Number(support_doc_id),
        version: newVersion,
        file: req.file.filename,
        created_by,
        updated_by,
        created_date: new Date(),
      },
    });

    console.log(`File uploaded: ${req.file.filename} | Version: ${newVersion}`);
    console.log("Body:", req.body);
    console.log("File:", req.file);

    res.status(201).json({
      message: "File uploaded successfully",
      data: newFile,
    });

  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSupportDocumentFiles = async (req: Request, res: Response): Promise<void> => {
  const { support_doc_id } = req.params;

  try {
    if (!support_doc_id) {
      res.status(400).json({ message: "support_doc_id is required" });
      return;
    }

    const files = await prismaDB2.tbl_support_document_file.findMany({
      where: {
        support_doc_id: Number(support_doc_id),
        is_deleted: false,
      },
      orderBy: {
        version: "asc",
      },
    });

    if (!files || files.length === 0) {
      res.status(404).json({ message: "No files found for this support_doc_id" });
      return;
    }

    res.status(200).json({
      message: "Files fetched successfully",
      data: files,
    });

  } catch (error) {
    console.error("Error fetching files:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSingleSupportDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    if (!id) {
      res.status(400).json({ message: "File ID is required" });
      return;
    }

    const fileData = await prismaDB2.tbl_support_document_file.findUnique({
      where: { id: Number(id) },
    });

    if (!fileData || fileData.is_deleted) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    res.status(200).json({
      message: "File fetched successfully",
      data: fileData,
    });

  } catch (error) {
    console.error("Error fetching file:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



// Lokasi file untuk Download Upload View


export const viewSupportDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const idParam = req.params.id;
  const id = Number(idParam);

  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid file ID" });
    return;
  }

  try {
    const file = await prismaDB2.tbl_support_document_file.findUnique({
      where: { id },
    });

    if (!file || file.is_deleted || !file.file) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const filePath = path.join(uploadsDir, file.file);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "File not found in storage" });
      return;
    }

    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");

    res.sendFile(filePath);
  } catch (error) {
    console.error("Error retrieving file:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// Download file
export const downloadSupportDocumentFile = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);

  try {
    const file = await prismaDB2.tbl_support_document_file.findUnique({
      where: { id },
    });

    if (!file || file.is_deleted) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const filePath = path.join(uploadsDir, file.file ?? "");
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "File not found in storage" });
      return;
    }

    const fileName = file.file ?? "downloaded_file";
    res.download(filePath, fileName);
  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Download file with watermark
export const downloadWithWatermark = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);

  try {
    const file = await prismaDB2.tbl_support_document_file.findUnique({
      where: { id },
    });

    if (!file || file.is_deleted) {
      res.status(404).json({ message: "File not found" });
      return;
    }

    const filePath = path.join(uploadsDir, file.file ?? "");
    const ext = path.extname(file.file ?? "").toLowerCase();

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ message: "File not found in storage" });
      return;
    }

    if (ext === ".pdf") {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

      for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText("GODoc Confidential", {
          x: width - 220,
          y: height - 50,
          size: 20,
          font: helveticaFont,
          color: rgb(0.95, 0.1, 0.1),
          opacity: 0.4,
        });
      }

      const modifiedPdfBytes = await pdfDoc.save();
      res.send(Buffer.from(modifiedPdfBytes));
    }

    else if ([".jpg", ".jpeg", ".png"].includes(ext)) {
      const imageBuffer = fs.readFileSync(filePath);
      const watermarked = await sharp(imageBuffer)
        .composite([
          {
            input: Buffer.from(
              `<svg width="200" height="50">
                <text x="0" y="35" font-size="30" fill="red" opacity="0.4">GODoc Confidential</text>
              </svg>`
            ),
            gravity: "northeast",
          },
        ])
        .toBuffer();

      res.setHeader("Content-Type", `image/${ext.replace(".", "")}`);
      res.setHeader("Content-Disposition", `attachment; filename=${file.file}`);
      res.send(watermarked);
    }

    else {
      res.status(415).json({ message: "Watermark not supported for this file type" });
    }

  } catch (error) {
    console.error("Error applying watermark:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



// note for support document
export const createSupportDocumentNote = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = req.body;

    // Validasi field yang wajib diisi
    const requiredFields = ["support_doc_id", "noted", "created_by"];
    const missingFields = requiredFields.filter(field => !data[field]);

    if (missingFields.length > 0) {
      console.warn("Validation Error: Missing fields -", missingFields);
      res.status(400).json({
        error: "Validation Error",
        details: `Missing fields: ${missingFields.join(", ")}`
      });
      return;
    }

    const supportDocId = Number(data.support_doc_id);

    // Cek apakah dokumen support valid
    const supportDoc = await prismaDB2.tbl_support_document.findUnique({
      where: { id: supportDocId },
    });

    if (!supportDoc || supportDoc.is_deleted) {
      console.warn(`Document not found or deleted: ID ${supportDocId}`);
      res.status(404).json({
        error: "Not Found",
        details: "Support document not found or already deleted."
      });
      return;
    }

    // Ambil versi terakhir catatan
    const lastNote = await prismaDB2.tbl_support_document_noted.findFirst({
      where: {
        support_doc_id: supportDocId,
        is_deleted: false,
      },
      orderBy: {
        version: "desc",
      },
    });

    const newVersion = lastNote ? lastNote.version + 1 : 1;

    // Simpan note baru
    const newNote = await prismaDB2.tbl_support_document_noted.create({
      data: {
        support_doc_id: supportDocId,
        version: newVersion,
        noted: data.noted,
        created_by: data.created_by,
        updated_by: data.updated_by ?? data.created_by,
        created_date: new Date(),
      },
    });

    console.log(`Note created: doc_id=${supportDocId}, version=${newVersion}`);

    res.status(201).json({
      message: "Note created successfully",
      data: newNote,
    });

  } catch (error) {
    console.error("Error creating support doc note:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

//get note by support_doc_id
// getSupportDocNotes
export const getSupportDocNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { support_doc_id } = req.params;

    if (!support_doc_id || isNaN(Number(support_doc_id))) {
      console.warn("Invalid or missing support_doc_id:", support_doc_id);
      res.status(400).json({
        error: "Validation Error",
        details: "Valid support_doc_id is required in URL params"
      });
      return;
    }

    const docId = Number(support_doc_id);

    // Cek apakah dokumen support valid
    const supportDoc = await prismaDB2.tbl_support_document.findUnique({
      where: { id: docId },
    });

    if (!supportDoc || supportDoc.is_deleted) {
      console.warn(`Support document not found or deleted: ID ${docId}`);
      res.status(404).json({
        error: "Not Found",
        details: "Support document not found or already deleted."
      });
      return;
    }

    // Ambil semua catatan yang belum dihapus
    const notes = await prismaDB2.tbl_support_document_noted.findMany({
      where: {
        support_doc_id: docId,
        is_deleted: false,
      },
      orderBy: {
        version: "desc",
      },
    });

    res.status(200).json({
      message: "Notes fetched successfully",
      data: notes,
    });

  } catch (error) {
    console.error("Error fetching support document notes:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};





