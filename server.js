import express from "express";
import axios from "axios";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const upload = multer();
const app = express();
app.use(express.json());

let signatureStatus = {};

app.post("/api/start-signature", async (req, res) => {
  try {
    const response = await axios.post(
      "https://api.hellosign.com/v3/signature_request/create_embedded",
      {
        client_id: "31f09cda8cfe081fbde7bb219aaee18c",
        title: "NDA with Acme Co.",
        subject: "Please sign this NDA",
        message: "Let’s proceed with signing.",
        signers: [
          { email_address: "alexbalaskasgr@gmail.com", name: "Alex", order: 0 },
        ],
        file_urls: ["https://www.orimi.com/pdf-test.pdf"],
        test_mode: 1,
      },
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(process.env.API_KEY + ":").toString("base64"),
          "Content-Type": "application/json",
        },
      }
    );

    const signatureId =
      response.data.signature_request.signatures[0].signature_id;

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

    const requestId = response.data.signature_request.signature_request_id;
    const signUrl = signUrlResp.data.embedded.sign_url;
    res.json({ signUrl, requestId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to start signature process" });
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
