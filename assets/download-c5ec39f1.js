function c(t,n){const o=URL.createObjectURL(t),e=document.createElement("a");e.href=o,e.download=n,e.rel="noopener",e.click(),setTimeout(()=>URL.revokeObjectURL(o),1e3)}export{c as t};
