import path from "node:path";
import sharp from "sharp";

const root=process.cwd();
const ids=["lime-hoodie","cyan-jacket","cream-cardigan","varsity-jacket","moss-sweater","cream-cap","blue-cap","lime-beanie","round-glasses","headphones","canvas-tote","crossbody-bag","cyan-scarf","bike-helmet","festival-pin","desk-lamp","leafy-plant","rocket-figure","cyan-poster","display-stand"];
const source=path.join(root,"assets/world/source/cosmetics-atlas.png");
const output=path.join(root,"public/world/art");
const {width,height}=await sharp(source).metadata();
if(!width||!height||width<1000||height<800) throw new Error("Unexpected cosmetics atlas size");
for(const [index,id] of ids.entries()) {
  const col=index%5,row=Math.floor(index/5);
  const left=Math.round(col*width/5),top=Math.round(row*height/4);
  const right=Math.round((col+1)*width/5),bottom=Math.round((row+1)*height/4);
  await sharp(source).extract({left,top,width:right-left,height:bottom-top}).resize(96,96,{kernel:"nearest"}).webp({quality:90,effort:6}).toFile(path.join(output,`cosmetic-${id}.webp`));
}
console.log(`Created ${ids.length} original cosmetic icons from ${width}×${height} atlas`);
