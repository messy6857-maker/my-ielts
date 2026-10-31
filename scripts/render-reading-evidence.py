from pathlib import Path
import subprocess,hashlib,json
import argparse
parser=argparse.ArgumentParser(description='Render independent source PDF excerpts for option verification')
parser.add_argument('books',type=Path,help='Directory containing cam18.pdf, cam20.pdf, cam21.pdf')
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'docs/evidence/reading-options')
args=parser.parse_args()
books=args.books
out=args.output
out.mkdir(parents=True,exist_ok=True)
# PDF-rendered excerpts; coordinates refer to the specified full-page raster dimensions.
rows=[
 ('cam18',49,47,(1200,1500),(80,610,915,155),'cam18-test2-options'),
 ('cam18',124,122,(1200,1500),(650,480,200,160),'cam18-test2-answers'),
 ('cam21',50,49,(1203,1700),(350,1040,650,170),'cam21-test2-options'),
 ('cam21',72,71,(1203,1700),(300,400,745,445),'cam21-test3-options'),
 ('cam21',121,120,(1061,1500),(480,780,210,260),'cam21-test2-answers'),
 ('cam21',123,122,(1061,1500),(475,895,230,190),'cam21-test3-answers'),
 ('cam20',100,100,(990,1400),(94,565,760,164),'cam20-test3-options'),
 ('cam20',102,102,(990,1400),(95,394,430,55),'cam20-test3-answers'),
]
manifest={'source':'https://www.frostyrhymes.com/cambridge-ielts-resources/','renderer':'pdftoppm 26.05.0','method':'Render original PDF option/answer regions; no text is recreated from the app data. These are visual evidence, while automated option tests are only regression snapshots.','excerpts':[]}
for book,page,printed,size,crop,label in rows:
 pdf=books/(book+'.pdf');x,y,w,h=crop
 args=['pdftoppm','-scale-dimension-before-rotation','-f',str(page),'-l',str(page),'-singlefile','-scale-to-x',str(size[0]),'-scale-to-y',str(size[1]),'-x',str(x),'-y',str(y),'-W',str(w),'-H',str(h),'-png',str(pdf),str(out/label)]
 subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 path=out/(label+'.png')
 manifest['excerpts'].append({'file':path.name,'book':book,'pdfPage':page,'printedPage':printed,'fullRaster':size,'clipPixels':crop,'pdfSha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'imageSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(out/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Rendered',len(rows),'independent PDF excerpts')
