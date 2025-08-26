import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [embedding, setEmbedding] = useState("");

  const uploadFile = async (endpoint) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await axios.post(`http://localhost:8000/${endpoint}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    if (endpoint === "transcribe") setTranscript(res.data.text);
    else setEmbedding(JSON.stringify(res.data.embedding.slice(0, 5)) + "...");
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>ASR Demo</h1>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={() => uploadFile("transcribe")}>Transcribe</button>
      <button onClick={() => uploadFile("embed_file")}>Embed</button>
      <div>
        <h2>Transcript</h2>
        <pre>{transcript}</pre>
      </div>
      <div>
        <h2>Embedding (first 5 numbers)</h2>
        <pre>{embedding}</pre>
      </div>
    </div>
  );
}
