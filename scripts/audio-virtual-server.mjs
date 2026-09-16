import http from "node:http";
import { readFile } from "node:fs/promises";
const page = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Проверка виртуального аудиовхода</title><style>body{font:18px system-ui;max-width:760px;margin:60px auto;padding:20px;line-height:1.6}button{font:inherit;margin:8px;padding:12px}pre{white-space:pre-wrap}audio{width:100%}</style><h1>Проверка виртуального аудиовхода</h1><p>Источник — подготовленный файл oral.wav. Системный микрофон не запрашивается. Используется AudioCapture из приложения и настоящий MediaRecorder браузера.</p><button id="start">Начать виртуальную запись</button><button id="stop" disabled>Остановить виртуальную запись</button><button id="cancel">Проверить позднее разрешение после отмены</button><p id="status" role="status">Готов к проверке</p><audio controls></audio><pre id="result"></pre><script type="module">
import { AudioCapture } from '/audio-capture.js';
const start=document.querySelector('#start'),stop=document.querySelector('#stop'),status=document.querySelector('#status'),out=document.querySelector('#result'),audio=document.querySelector('audio');
let capture,context,node,stream,chunks=0,url;
start.onclick=async()=>{try{
 context=new AudioContext();await context.resume();const bytes=await(await fetch('/oral.wav')).arrayBuffer();node=context.createBufferSource();node.buffer=await context.decodeAudioData(bytes);const destination=context.createMediaStreamDestination();node.connect(destination);stream=destination.stream;chunks=0;
 capture=new AudioCapture({buffer:()=>chunks++,complete:async blob=>{status.textContent='Виртуальная запись завершена';if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);audio.src=url;out.textContent=JSON.stringify({bytes:blob.size,chunks,mime:blob.type,tracks:stream.getTracks().map(t=>t.readyState)},null,2);start.disabled=false;stop.disabled=true;node.stop();await context.close();},error:e=>status.textContent=e.message},{getStream:async()=>stream,createRecorder:s=>{const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));return new MediaRecorder(s,mime?{mimeType:mime}:undefined);}});
 await capture.start();node.start();start.disabled=true;stop.disabled=false;status.textContent='Идёт запись виртуального потока';node.onended=()=>capture.stop();
}catch(e){status.textContent=String(e)}};
stop.onclick=()=>capture.stop();
document.querySelector('#cancel').onclick=async()=>{const ctx=new AudioContext(),dest=ctx.createMediaStreamDestination();let grant;const pending=new Promise(r=>grant=r);const session=new AudioCapture({buffer:()=>{},complete:()=>{},error:()=>{}},{getStream:()=>pending,createRecorder:s=>new MediaRecorder(s)});const started=session.start().catch(()=>{});await Promise.resolve();session.dispose();grant(dest.stream);await started;await Promise.resolve();out.textContent=JSON.stringify({latePermissionTracks:dest.stream.getTracks().map(t=>t.readyState)},null,2);status.textContent='Позднее виртуальное разрешение обработано';await ctx.close();};
window.onpagehide=()=>{capture?.dispose();node?.stop();context?.close();};
</script></html>`;
const files = {
  "/audio-capture.js": ".local/virtual-mic/audio-capture.js",
  "/microphone": ".local/virtual-mic/microphone.js",
  "/oral.wav": "tests/fixtures/audio/oral.wav",
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(page);
        return;
      }
      const path = files[req.url];
      if (!path) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        "Content-Type",
        req.url.endsWith(".wav") ? "audio/wav" : "text/javascript",
      );
      res.end(await readFile(path));
    } catch {
      res.writeHead(500);
      res.end("Read failed");
    }
  })
  .listen(4177, "127.0.0.1", () =>
    console.log(
      "Virtual audio QA: http://127.0.0.1:4177 — no physical microphone",
    ),
  );
