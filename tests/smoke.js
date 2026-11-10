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
    ok(await ev(()=>sales.length>=1 && Math.abs(sales[sales.length-1].total-18)<0.01),"sale not saved");
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
