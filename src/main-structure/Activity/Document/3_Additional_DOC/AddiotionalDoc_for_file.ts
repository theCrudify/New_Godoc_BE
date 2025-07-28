import { Request, Response } from "express";
import { prismaDB2 } from "../../../../config/database";
import path from "path";
import fs from "fs";

const uploadsDir = path.join(process.cwd(), "src", "uploads");



/**
 * Mendapatkan semua file untuk dokumen tertentu berdasarkan tr_additional_doc_id
 */
export const getDocumentFilesByDocId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tr_additional_doc_id } = req.query;

    if (!tr_additional_doc_id) {
      res.status(400).json({
        status: false,
        message: "tr_additional_doc_id is required"
      });
      return;
    }

    // Konversi ID ke integer
    const docId = parseInt(tr_additional_doc_id as string, 10);

    if (isNaN(docId)) {
      res.status(400).json({
        status: false,
        message: "tr_additional_doc_id must be a valid number"
      });
      return;
    }

    // Ambil semua file dokumen yang tidak terhapus
    const files = await prismaDB2.tr_additional_file.findMany({
      where: {
        tr_additional_doc_id: docId,
        is_deleted: false
      },
      orderBy: {
        version: 'desc'
      }
    });

    res.status(200).json({
      status: true,
      message: "Files retrieved successfully",
      data: files
    });

  } catch (error) {
    console.error("❌ Error retrieving document files:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};

/**
 * Upload file baru untuk dokumen
 */
export const uploadDocumentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tr_additional_doc_id, created_by } = req.body;
    const file = req.file;

    if (!tr_additional_doc_id || !file) {
      res.status(400).json({
        status: false,
        message: "tr_additional_doc_id and file are required"
      });
      return;
    }

    const docId = parseInt(tr_additional_doc_id, 10);
    if (isNaN(docId)) {
      res.status(400).json({
        status: false,
        message: "tr_additional_doc_id must be a valid number"
      });
      return;
    }

    const document = await prismaDB2.tr_additional_doc.findUnique({
      where: { id: docId }
    });

    if (!document) {
      res.status(404).json({
        status: false,
        message: "Document not found"
      });
      return;
    }

    // Cari versi terbaru
    const latestVersion = await prismaDB2.tr_additional_file.findFirst({
      where: { tr_additional_doc_id: docId },
      orderBy: { version: 'desc' }
    });

    const newVersion = latestVersion ? latestVersion.version + 1 : 1;
    const detectedMimetype = file.mimetype || 'application/octet-stream';

    // Rename file
    const fileExtension = path.extname(file.originalname);
    const timestamp = Date.now();
    const newFileName = `document-${docId}-${timestamp}${fileExtension}`;
    const newFilePath = path.join(file.destination, newFileName);

    fs.renameSync(file.path, newFilePath); // Rename file fisiknya

    // Simpan hanya nama file-nya
    const newDocumentFile = await prismaDB2.tr_additional_file.create({
      data: {
        tr_additional_doc_id: docId,
        version: newVersion,
        file: newFileName, // simpan nama file aja
        mimetype: detectedMimetype,
        created_by,
        created_date: new Date()
      }
    });

    res.status(201).json({
      status: true,
      message: "File uploaded successfully",
      data: newDocumentFile
    });

  } catch (error) {
    console.error("❌ Error uploading document file:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};
/**
 * Download file dokumen
 */
export const downloadDocumentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({
        status: false,
        message: "File ID is required"
      });
      return;
    }

    // Konversi ID ke integer
    const id = parseInt(fileId, 10);

    if (isNaN(id)) {
      res.status(400).json({
        status: false,
        message: "File ID must be a valid number"
      });
      return;
    }

    // Ambil informasi file
    const fileInfo = await prismaDB2.tr_additional_file.findUnique({
      where: {
        id,
        is_deleted: false
      }
    });

    if (!fileInfo || !fileInfo.file) {
      res.status(404).json({
        status: false,
        message: "File not found"
      });
      return;
    }

    // Path file fisik
    const filePath = path.join(uploadsDir, fileInfo.file);

    // Cek apakah file ada
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        status: false,
        message: "File not found on server"
      });
      return;
    }

    // Set header sesuai mimetype
    if (fileInfo.mimetype) {
      res.setHeader('Content-Type', fileInfo.mimetype);
    }

    // Set header untuk download
    res.setHeader('Content-Disposition', `attachment; filename=${fileInfo.file}`);

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("❌ Error downloading document file:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * View file dokumen
 */
export const viewDocumentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({
        status: false,
        message: "File ID is required"
      });
      return;
    }

    // Konversi ID ke integer
    const id = parseInt(fileId, 10);

    if (isNaN(id)) {
      res.status(400).json({
        status: false,
        message: "File ID must be a valid number"
      });
      return;
    }

    // Ambil informasi file
    const fileInfo = await prismaDB2.tr_additional_file.findUnique({
      where: {
        id,
        is_deleted: false
      }
    });

    if (!fileInfo || !fileInfo.file) {
      res.status(404).json({
        status: false,
        message: "File not found"
      });
      return;
    }

    // Path file fisik
    const filePath = path.join(uploadsDir, fileInfo.file);

    // Cek apakah file ada
    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        status: false,
        message: "File not found on server"
      });
      return;
    }

    // Set header sesuai mimetype untuk preview
    if (fileInfo.mimetype) {
      res.setHeader('Content-Type', fileInfo.mimetype);
    }

    // Set header untuk preview (inline)
    res.setHeader('Content-Disposition', `inline; filename=${fileInfo.file}`);

    // Stream file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("❌ Error viewing document file:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Hapus file dokumen (soft delete)
 */
export const deleteDocumentFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    const { updated_by } = req.body;

    if (!fileId) {
      res.status(400).json({
        status: false,
        message: "File ID is required"
      });
      return;
    }

    // Konversi ID ke integer
    const id = parseInt(fileId, 10);

    if (isNaN(id)) {
      res.status(400).json({
        status: false,
        message: "File ID must be a valid number"
      });
      return;
    }

    // Cek apakah file ada
    const fileInfo = await prismaDB2.tr_additional_file.findUnique({
      where: { id }
    });

    if (!fileInfo) {
      res.status(404).json({
        status: false,
        message: "File not found"
      });
      return;
    }

    // Soft delete file
    const updatedFile = await prismaDB2.tr_additional_file.update({
      where: { id },
      data: {
        is_deleted: true,
        updated_at: new Date(),
        updated_by
      }
    });

    res.status(200).json({
      status: true,
      message: "File deleted successfully",
      data: updatedFile
    });

  } catch (error) {
    console.error("❌ Error deleting document file:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    await prismaDB2.$disconnect();
  }
};


// Function to update progress support
// This function updates the progress support for a specific proposed changes ID
export const updateProgressSupport = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { progresssupport } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ status: false, error: "Invalid ID format" });
      return;
    }

    if (typeof progresssupport !== "string") {
      res.status(400).json({ status: false, error: "progresssupport must be a string" });
      return;
    }

    const updated = await prismaDB2.tr_proposed_changes.update({
      where: { id },
      data: { progresssupport },
    });

    res.status(200).json({
      status: true,
      message: "Progress support updated successfully",
      data: updated,
    });

  } catch (error: any) {
    console.error("❌ Error updating progresssupport:", error);

    res.status(500).json({
      status: false,
      error: "Failed to update progresssupport",
      name: error.name || "UnknownError",
      message: error.message || "An unexpected error occurred",
      meta: error.meta || null
    });
  }
};


// Function to delete additional file (soft delete)
// This function marks a file as deleted in the database
// It does not physically delete the file from the server
// It updates the is_deleted field to true
export const deleteAdditionalFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      res.status(400).json({
        status: false,
        message: "File ID is required"
      });
      return;
    }

    const id = parseInt(fileId, 10);
    if (isNaN(id)) {
      res.status(400).json({
        status: false,
        message: "File ID must be a valid number"
      });
      return;
    }

    // Cari file yang belum dihapus
    const fileInfo = await prismaDB2.tr_additional_file.findFirst({
      where: {
        id,
        is_deleted: false
      }
    });

    if (!fileInfo) {
      res.status(404).json({
        status: false,
        message: "File not found or already deleted"
      });
      return;
    }

    // Update is_deleted
    await prismaDB2.tr_additional_file.update({
      where: { id },
      data: {
        is_deleted: true
      }
    });

    res.status(200).json({
      status: true,
      message: "File marked as deleted successfully"
    });

  } catch (error) {
    console.error("❌ Error deleting file:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
