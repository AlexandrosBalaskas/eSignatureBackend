import express from "express";
import axios from "axios";
import multer from "multer";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import api from "@dropbox/sign";

let clients = [];

const apiCaller = new api.SignatureRequestApi();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();
apiCaller.username = process.env.API_KEY;

const upload = multer();
const app = express();
app.use(express.json());

let signatureStatus = {};

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

app.post("/api/attachment/upload", upload.any(), async (req, res) => {
  try {
    const file = req.files[0];
    fs.writeFileSync("output.pdf", file.buffer);
    res.json({
      attachmentId: "72e21f06-0c38-4bf9-92b9-41d6ee21e384",
      fileName: "SamplePdf_1757498753981.pdf",
      sizeInBytes: 157148,
      attachmentCategoryText: "sample",
      attachmentCategoryCL: "AuditReport",
    });
  } catch (e) {
    console.log(e);
  }
});

app.post("/api/start-signature", async (req, res) => {
  try {
    apiCaller
      .signatureRequestCreateEmbedded({
        client_id: "31f09cda8cfe081fbde7bb219aaee18c",
        title: "NDA with Acme Co.",
        subject: "Please sign this NDA",
        message: "Let’s proceed with signing.",
        signers: [
          { email_address: "alexbalaskasgr@gmail.com", name: "Alex", order: 0 },
        ],
        files: [fs.createReadStream("./output.pdf")],
        test_mode: 1,
      })
      .then(async (response) => {
        const signatureId =
          response.body.signatureRequest.signatures[0].signatureId;

        const signUrlResp = await axios.post(
          `https://api.hellosign.com/v3/embedded/sign_url/${signatureId}`,
          {},
          {
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(process.env.API_KEY + ":").toString("base64"),
            },
          }
        );

        const requestId = response.body.signatureRequest.signatureRequestId;
        const signUrl = signUrlResp.data.embedded.sign_url;
        res.json({
          signUrl: `${signUrl}&client_id=31f09cda8cfe081fbde7bb219aaee18c&skip_domain_verification=true`,
          requestId,
        });
      });
  } catch (e) {
    console.log(e);
  }
});
app.post("/hs-events", upload.none(), async (req, res) => {
  res.set("Content-Type", "text/plain");
  res.status(200).send("Hello API Event Received");

  const callback_data = JSON.parse(req.body.json);

  const event = callback_data.event?.event_type;
  const requestId = callback_data.signature_request?.signature_request_id;

  if (event === "signature_request_all_signed") {
    console.log("✅ Document completed:", requestId);
    signatureStatus[requestId] = "completed";

    try {
      const response = await axios.get(
        `https://api.hellosign.com/v3/signature_request/files/${requestId}`,
        {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(process.env.API_KEY + ":").toString("base64"),
          },
          responseType: "arraybuffer",
        }
      );

      import("fs").then((fs) => {
        fs.writeFileSync("signed_document.pdf", response.data);
        console.log("📄 Saved signed_document.pdf");
        clients.forEach((client) => {
          client.write(`event: signed\n`);
          client.write(`data: ${JSON.stringify({ requestId })}\n\n`);
        });
      });
    } catch (err) {
      console.error("❌ Failed to download signed PDF", err.message);
    }
  }
});

app.post("/api/signature-status/:id", (req, res) => {
  const { id } = req.params;
  res.json({ status: signatureStatus[id] || "pending" });
});

app.get("/api/download-signed/:id", (req, res) => {
  const filePath = path.resolve("signed_document.pdf");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    "attachment; filename=signed_document.pdf"
  );

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Error sending PDF:", err);
      res.status(500).send("Error downloading PDF");
    }
  });
});

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
