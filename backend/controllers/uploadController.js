const axios = require("axios");
const FormData = require("form-data");

exports.uploadImage = async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64 in request body" });
    }

    // Remove the data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Try ImgBB first (most reliable free image host)
    try {
      const imgbbForm = new FormData();
      imgbbForm.append("key", "5e65ce0a9cb6e04a4d41e0dcd tried8762a"); // free public API key
      imgbbForm.append("image", base64Data);

      const imgbbRes = await axios.post("https://api.imgbb.com/1/upload", imgbbForm, {
        headers: imgbbForm.getHeaders(),
        timeout: 15000,
      });

      if (imgbbRes.data && imgbbRes.data.data && imgbbRes.data.data.url) {
        return res.json({ imageUrl: imgbbRes.data.data.url });
      }
    } catch (imgbbErr) {
      console.log("ImgBB failed, trying fallback...", imgbbErr.message);
    }

    // Fallback: freeimage.host
    try {
      const formData = new FormData();
      formData.append("key", "6d207e02198a847aa98d0a2a901485a5");
      formData.append("action", "upload");
      formData.append("source", base64Data);
      formData.append("format", "json");

      const response = await axios.post("https://freeimage.host/api/1/upload", formData, {
        headers: formData.getHeaders(),
        timeout: 15000,
      });

      if (response.data && response.data.image && response.data.image.url) {
        return res.json({ imageUrl: response.data.image.url });
      }
    } catch (freeimageErr) {
      console.log("FreeImage also failed:", freeimageErr.message);
    }

    // Final fallback: return base64 as data URL (works for clipboard copy)
    return res.json({ imageUrl: `data:image/png;base64,${base64Data}`, isDataUrl: true });

  } catch (error) {
    console.error("Upload error:", error.message);
    res.status(500).json({ error: "Image upload failed" });
  }
};
