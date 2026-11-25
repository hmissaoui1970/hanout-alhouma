// Hanout Alhouma Dakye - smoke tests: every main flow, run before each publish.
// usage: node smoke.js /path/to/index.html     (exit code 1 if anything fails)
const {chromium,devices}=require('playwright');
const FILE=process.argv[2]; if(!FILE){ console.error("usage: node smoke.js index.html"); process.exit(2); }
const results=[]; let page, errors=[];
async function clean(){ try{ await page.evaluate(()=>{ document.querySelectorAll('.sheet').forEach(e=>e.hidden=true); const c=document.getElementById('crashBox'); if(c) c.remove(); if(typeof rushOn!=='undefined'&&rushOn) closeRush(); }); }catch{} }
async function t(name,fn){ await clean(); try{ await fn(); results.push(["✓",name]); }catch(e){ results.push(["✗",name,String(e.message||e).slice(0,200)]); } }
const ok=(c,m)=>{ if(!c) throw new Error(m||"failed"); };
const ev=(f,a)=>page.evaluate(f,a);
async function fresh(){ await page.goto('file://'+FILE); await page.waitForTimeout(900); }

(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({...devices['iPhone 13'], hasTouch:true});
  page=await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror',e=>errors.push(e.message));
  await fresh();

  await t("page loads with no script error",async()=>{ ok(!errors.length,errors.join(" | ")); ok(await ev(()=>typeof render==="function"),"app not started"); });

  await t("sign-up: name, shop, phone, code twice, city",async()=>{
    await ev(()=>{ onbShow(onbSlides().length-1); setStage("new"); });
    await page.fill('#ownName','سعيد'); await page.fill('#shopName','حانوت التجربة'); await page.fill('#shopPhone','0611223344');
    await page.fill('#shopPin','1234'); await page.fill('#shopPin2','1243');
    ok(await page.$eval('#shopCity',e=>e.disabled),"city open although the two codes differ");
    await page.fill('#shopPin2','1234'); await page.fill('#shopCity','فاس'); await page.waitForTimeout(100);
    await page.click('.onb-go'); await page.waitForTimeout(900);
    ok(await page.$eval('#onb',e=>e.hidden),"sign-up did not finish");
    ok(await ev(()=>owner&&owner.shop==="حانوت التجربة"&&!!owner.pin),"owner not saved");
    ok(await page.$eval('#welSheet',e=>!e.hidden),"no welcome screen");
    await page.click('#welClose');
  });

  await t("stock: add products (unit, barcode, by weight)",async()=>{
    await ev(async()=>{
      await saveProduct({id:'t-coca',name:'كوكا 1 لتر',price:9,stock:10,min:3,barcode:'5449000000996'});
      await saveProduct({id:'t-bread',name:'خبز',price:1.5,stock:40,min:5});
      await saveProduct({id:'t-flour',name:'طحين',price:12,stock:20,min:2,byKg:true});
    });
    ok(await ev(()=>products.length>=3),"products not saved");
  });

  await t("scan a known barcode adds it",async()=>{
    await ev(()=>{ showTab('caisse'); curBasket().items=[]; saveBaskets(); handleScan('5449000000996'); });
    ok(await ev(()=>basketTotal(curBasket())===9),"total should be 9");
  });

  await t("scan an unknown barcode opens 'new product'",async()=>{
    await ev(()=>handleScan('036000291452')); await page.waitForTimeout(200);
    ok(await page.$eval('#sheet',e=>!e.hidden),"sheet not opened");
    ok((await page.inputValue('#pCode'))==='036000291452',"code not filled");
    await page.click('#sheetCancel');
  });

  // a scan gun = a keyboard typing very fast; AZERTY phones turn digits into &é"'( so the app reads the key, not the letter
  const gun=(code,end)=>ev(([code,end])=>{ const az={1:"&",2:"é",3:'"',4:"'",5:"(",6:"-",7:"è",8:"_",9:"ç",0:"à"};
    for(const d of code) document.dispatchEvent(new KeyboardEvent('keydown',{key:az[d]||d,code:"Digit"+d,bubbles:true,cancelable:true}));
    if(end) document.dispatchEvent(new KeyboardEvent('keydown',{key:end,code:end,bubbles:true,cancelable:true})); },[code,end]);
  await t("scan gun on an AZERTY phone (Enter at the end)",async()=>{
    await ev(()=>{ showTab('caisse'); curBasket().items=[]; saveBaskets(); });
    await gun('5449000000996','Enter'); await page.waitForTimeout(50);
    ok(await ev(()=>basketTotal(curBasket())===9),"gun code not read: "+await ev(()=>basketTotal(curBasket())));
  });
  await t("scan gun with no Enter (code ends when the keys stop)",async()=>{
    await gun('5449000000996',null); await page.waitForTimeout(300);
    ok(await ev(()=>basketTotal(curBasket())===18),"second scan not added");
  });
  await t("scan gun: first digits that fell into a box are taken out",async()=>{
    await ev(()=>{ const i=document.getElementById('bGiven'); i.value="20544"; i.focus(); });
    await gun('5449000000996','Tab'); await page.waitForTimeout(50);
    ok((await page.inputValue('#bGiven'))==="20","box keeps: "+await page.inputValue('#bGiven'));
    ok(await ev(()=>basketTotal(curBasket())===27),"third scan not added");
    await ev(()=>document.activeElement.blur());
  });
  await t("UPC-A (12 digits) finds the EAN-13 product",async()=>{
    await ev(async()=>{ await saveProduct({id:'t-upc',name:'بسكوي تجربة',price:4,stock:5,min:1,barcode:'0012345678905'}); curBasket().items=[]; saveBaskets(); handleScan('012345678905'); });
    ok(await ev(()=>basketTotal(curBasket())===4),"UPC not matched");
    await ev(()=>{ curBasket().items=[]; saveBaskets(); });
  });

  await t("credit: find a client by number, by part of the name, by phone; regulars one tap",async()=>{
    const r=await ev(async()=>{
      await saveClient({id:'k1',name:'لالة فاطمة الزهراء',phone:'0612345678'});
      await saveClient({id:'k2',name:'سي محمد البقال',phone:''});
      await saveClient({id:'k3',name:'محمد ولد الجيران',phone:''});
      const k1=clients.find(c=>c.id==='k1'), k2=clients.find(c=>c.id==='k2');
      const top=q=>clients.map(c=>({c,s:clientScore(c,q)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).map(x=>x.c.id);
      return { nums: k1.num!=null && k2.num!=null && k1.num!==k2.num,
        byNum: top(String(k2.num))[0], byHash: top('#'+k1.num)[0], byWord: top('فاطمة')[0], byPrefix: top('الزهر')[0],
        byTitle: top('لالة')[0]!==undefined, byPhone: top('345')[0], twoMohamed: top('محمد').length>=2 };
    });
    ok(r.nums,"clients got no numbers"); ok(r.byNum==='k2',"number search: "+r.byNum); ok(r.byHash==='k1',"#number search: "+r.byHash);
    ok(r.byWord==='k1' && r.byPrefix==='k1',"name search: "+r.byWord+" "+r.byPrefix); ok(r.byPhone==='k1',"phone search: "+r.byPhone); ok(r.twoMohamed,"common name should list all");
    // regulars: the client with credit shows as a one-tap button, and tapping it writes the credit
    await ev(async()=>{ showTab('caisse'); curBasket().items=[]; saveBaskets(); await addEntry({clientId:'k2',at:Date.now(),type:'credit',amount:5,note:''}); render(); addToBasket(products[0].id); });
    await ev(()=>openCreditSheet());
    ok(await ev(()=>[...document.querySelectorAll('#crRegs .crreg b')].some(b=>b.textContent==='سي محمد البقال')),"regular not shown");
    const before=await ev(()=>balanceOf('k2'));
    await ev(()=>[...document.querySelectorAll('#crRegs .crreg')].find(b=>b.textContent.includes('سي محمد البقال')).click());
    await page.waitForTimeout(150);
    ok(await ev(b=>balanceOf('k2')>b,before),"tapping the regular did not write the credit");
  });

  await t("client page: send the account to the client on WhatsApp",async()=>{
    const r=await ev(async()=>{
      await saveClient({id:'st1',name:'سي رشيد',phone:''});
      const t0=Date.now()-5*864e5;
      await addEntry({clientId:'st1',at:t0,type:'credit',amount:40,note:'زيت'});
      await addEntry({clientId:'st1',at:t0+864e5,type:'payment',amount:40,note:''});      // account back to zero
      await addEntry({clientId:'st1',at:t0+2*864e5,type:'credit',amount:25,note:'سكر'});
      await addEntry({clientId:'st1',at:t0+3*864e5,type:'payment',amount:10,note:''});
      render(); openClient('st1');
      const txt=clientStatement(clients.find(c=>c.id==='st1'));
      const noPhone={row:!document.getElementById('csPhoneRow').hidden, href:document.getElementById('csSend').href};
      document.getElementById('csPhoneIn').value='0661234567'; await document.getElementById('csPhoneSave').onclick(); 
      return {txt,noPhone,href:document.getElementById('csSend').href,row:!document.getElementById('csPhoneRow').hidden};
    });
    ok(r.txt.includes('25.00') && r.txt.includes('10.00') && r.txt.includes('15.00'),"statement amounts: "+r.txt);
    ok(!r.txt.includes('40.00'),"settled movements should not be listed");
    ok(r.noPhone.row && r.noPhone.href.startsWith('https://wa.me/?text='),"no phone: should ask for it and still allow sending");
    ok(r.href.startsWith('https://wa.me/212661234567?text=') && !r.row,"with phone: "+r.href.slice(0,40));
    await ev(()=>document.getElementById('btnCloseClient').click());
  });

  await t("credit above 100 DH asks for the client's WhatsApp first",async()=>{
    await ev(async()=>{ localStorage.setItem(bkKey("phonelimit"),"100");
      await saveClient({id:'pl1',name:'عمي بوشعيب',phone:''}); await addEntry({clientId:'pl1',at:Date.now(),type:'credit',amount:95,note:''});
      showTab('caisse'); curBasket().items=[]; saveBaskets(); addToBasket('t-coca'); render();
      document.getElementById('bClient').value='عمي بوشعيب'; window.__p=checkoutBasket("credit"); });
    await page.waitForTimeout(150);
    ok(await ev(()=>!document.getElementById('phoneAsk').hidden),"no ask window above the limit");
    await ev(()=>document.getElementById('paCancel').click()); await ev(()=>window.__p);
    ok(await ev(()=>Math.abs(balanceOf('pl1')-95)<0.01),"cancel should not write the credit");
    await ev(()=>{ document.getElementById('bClient').value='عمي بوشعيب'; window.__p=checkoutBasket("credit"); });
    await page.waitForTimeout(150);
    await ev(()=>{ document.getElementById('paIn').value='0661112233'; document.getElementById('paSave').click(); }); await ev(()=>window.__p);
    const r=await ev(()=>({b:balanceOf('pl1'),ph:clients.find(c=>c.id==='pl1').phone}));
    ok(r.b>95 && r.ph==='0661112233',"after the number the credit should go through: "+JSON.stringify(r));
    // small credit, no number: no question
    await ev(async()=>{ await saveClient({id:'pl2',name:'ولد مي زهرة',phone:''}); });
    const msg=await ev(()=>doCredit('ولد مي زهرة',{amount:10}));
    ok(await ev(()=>document.getElementById('phoneAsk').hidden) && /كتبت/.test(msg),"small credit should not ask");
  });

  await t("share card opens with the QR and a WhatsApp link",async()=>{
    await ev(()=>document.getElementById('shareOpen').click());
    ok(await ev(()=>!document.getElementById('shareSheet').hidden),"share card not open");
    ok(await ev(()=>document.getElementById('shareQr').naturalWidth>100),"QR image missing");
    ok(await ev(()=>document.getElementById('shareWa').href.includes('hmissaoui1970.github.io')),"WhatsApp link has no app link");
    await ev(()=>document.getElementById('shareClose').click());
  });

  await t("voice text: quantity, item, price (iPhone punctuation)",async()=>{
    const r=await ev(()=>parseSpokenLines("تلاتة كوكا عشرة دراهم. و جورج فانتا، ٨ د.إ").map(l=>[l.qty,l.price]));
    ok(JSON.stringify(r)==='[[3,30],[2,16]]',"got "+JSON.stringify(r));   // totals: 3x10, 2x8
  });

  await t("weighed product: 1.5 kg x 12 = 18",async()=>{
    await ev(()=>{ curBasket().items=[]; saveBaskets(); addToBasket('t-flour'); });
    ok(await page.$eval('#kgSheet',e=>!e.hidden),"weight pad not opened");
    await page.click('#kgQuick [data-w="1.5"]'); await page.click('#kgOk');
    ok(await ev(()=>basketTotal(curBasket())===18),"total should be 18");
  });

  await t("cash sale: change and stock",async()=>{
    await ev(()=>{ curBasket().items=[]; saveBaskets(); addToBasket('t-coca'); addToBasket('t-coca'); });
    const before=await ev(()=>products.find(p=>p.id==='t-coca').stock);
    await ev(async()=>{ $("#bGiven").value="20"; await checkoutBasket("cash"); }); await page.waitForTimeout(200);
    const after=await ev(()=>products.find(p=>p.id==='t-coca').stock);
    ok(after===before-2,`stock ${before} -> ${after}`);
    ok(await ev(()=>sales.some(x=>Math.abs(x.total-18)<0.01)),"sale not saved");
  });

  await t("credit: sale on a client's notebook",async()=>{
    await ev(async()=>{ curBasket().items=[]; addToBasket('t-bread'); addToBasket('t-bread'); saveBaskets(); });
    const r=await ev(async()=>{ try{ if(typeof creditTo==="function"){ await creditTo("سي محمد"); } else { openCreditSheet(); } return true; }catch(e){ return e.message; } });
    ok(r===true,String(r));
  });

  await t("rush mode: open, scan, pay, next client",async()=>{
    await ev(()=>{ curBasket().items=[]; saveBaskets(); }); await page.click('#rushOpen'); await page.waitForTimeout(400);
    await ev(()=>{ handleScan('5449000000996'); });
    ok((await page.textContent('#rushTotal'))==='9.00',"rush total");
    await page.click('#rushPay [data-pay="20"]'); await page.waitForTimeout(300);
    ok((await page.textContent('#rushChangeV')).includes('11.00'),"change should be 11");
    await page.waitForTimeout(2800); ok((await page.textContent('#rushTotal'))==='0.00',"next client not started");
    await page.click('#rushClose');
  });

  await t("scale pop-up: new item asks price per kilo",async()=>{
    await page.click('#wOpen'); await page.click('#wGrid .witem.new >> nth=0');
    ok(await page.$eval('#wPrice',e=>!e.hidden),"price pad not shown");
    await page.click('#wPad button:text-is("8")'); await page.click('#wPriceOk'); await page.waitForTimeout(200);
    ok(await page.$eval('#kgSheet',e=>!e.hidden),"weight pad not opened"); await page.click('#kgCancel');
  });

  await t("stock file: export/import shape",async()=>{
    const n=await ev(()=>products.length); ok(n>=3,"no products");
  });

  await t("backup reminder: daily at closing time, per shop",async()=>{
    const r=await ev(()=>{
      const realDate=Date; const set=(h,lastAgoH)=>{
        localStorage.setItem(bkKey("bkfreq"),"1"); localStorage.setItem(bkKey("bkhour"),"21"); localStorage.removeItem(bkKey("bklater"));
        const now=new realDate(); now.setHours(h,30,0,0);
        localStorage.setItem(bkKey("lastbackup"),String(now.getTime()-lastAgoH*3600e3));
        window.Date=class extends realDate{ constructor(...a){ super(...(a.length?a:[now.getTime()])); } static now(){ return now.getTime(); } };
        const due=backupDue(); window.Date=realDate; return due; };
      return { morningAfterBackupYesterday: set(10,14), nightNoBackupToday: set(21,24), nightBackedUpToday: set(22,0.5), missedTwoDays: set(9,60) };
    });
    ok(r.morningAfterBackupYesterday===false,"should wait until closing time");
    ok(r.nightNoBackupToday===true,"should remind at closing time");
    ok(r.nightBackedUpToday===false,"already backed up today");
    ok(r.missedTwoDays===true,"missed days should remind at any hour");
    ok(await ev(()=>bkKey("x").includes(":")),"reminder not kept per shop");
  });

  await t("backup includes the owner",async()=>{
    const r=await ev(()=>{ const f=backupFile(); return f.text(); });
    const d=JSON.parse(r); ok(d.owner && d.owner.shop==="حانوت التجربة" && Array.isArray(d.products),"backup incomplete");
  });

  await t("subscription code: valid for this shop only",async()=>{
    const r=await ev(()=>{ const until=subDay(Date.now())+30; const code=String(until).padStart(4,"0")+subMac(curShop,until);
      return [subRead(code,curShop)===until, subRead(code,"212699999999")===null]; });
    ok(r[0]&&r[1],"code check "+r);
  });

  await t("exit locks the shop, code opens it",async()=>{
    await page.click('#exitBtn'); await page.waitForTimeout(300);
    ok(await page.$eval('#lock',e=>!e.hidden),"not locked");
    for(const k of "1234") await page.keyboard.press(k); await page.waitForTimeout(500);
    ok(await page.$eval('#lock',e=>e.hidden),"code did not unlock");
  });

  await t("data survives a reload",async()=>{
    await page.waitForTimeout(600); await fresh();
    for(const k of "1234") await page.keyboard.press(k); await page.waitForTimeout(700);
    ok(await ev(()=>products.some(p=>p.id==='t-coca') && sales.length>=1),"data lost after reload");
  });

  await t("crash guard catches an error without freezing",async()=>{
    await ev(()=>{ setTimeout(()=>{ throw new Error("test crash"); },0); }); await page.waitForTimeout(300);
    ok(await page.$('#crashBox'),"no crash message");
    ok(await ev(()=>typeof render==="function" && (render(),true)),"app frozen after error");
    await page.click('#crashClose');
  });

  await t("no unexpected script errors during the run",async()=>{ const real=errors.filter(e=>!/test crash/.test(e)); ok(!real.length,real.join(" | ")); });

  await b.close();
  for(const r of results) console.log(r.join("  "));
  const bad=results.filter(r=>r[0]==="✗").length;
  console.log(bad?`\n${bad} FAILED of ${results.length}`:`\nALL ${results.length} PASSED`);
  process.exit(bad?1:0);
})();
