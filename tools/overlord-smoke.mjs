// Isolated browser regression: source scene, real skin/clips, source branches.
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const modulePath=process.env.OVERLORD_PLAYWRIGHT;
if(!modulePath)throw Error('Set OVERLORD_PLAYWRIGHT to an existing playwright-core/index.mjs.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/overlord.html');
  await page.locator('#asset-status').filter({hasText:'원작 장면 변환'}).waitFor({timeout:60000});
  await page.locator('#objects button').first().click();
  const position=page.locator('[data-transform="px"]');
  await position.fill('13.5');await position.dispatchEvent('change');
  if(await position.inputValue()!=='13.5')throw Error('Map position edit failed');
  await page.locator('[data-mode="motion"]').click();
  await page.locator('#search').fill('조운');
  await page.locator('#catalog button').filter({hasText:'조운'}).click();
  await page.locator('#source-combat').waitFor({state:'visible',timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#bind-attack').value!=='');
  await page.locator('[data-action="attack"]').click();
  await page.waitForFunction(()=>document.querySelector('#source-sequence').textContent.includes('기본 공격 1타'));
  await page.locator('#weapon-info').filter({hasText:'장착됨'}).waitFor();
  await page.locator('#show-weapon').uncheck();
  await page.locator('#show-weapon').check();
  await page.locator('[data-action="attack"]').click();
  await page.waitForFunction(()=>document.querySelector('#source-sequence').textContent.includes('기본 공격 2타'));
  await page.locator('[data-action="skill1"]').click();
  await page.waitForFunction(()=>document.querySelector('#source-sequence').textContent.includes('스킬 1'));
  await page.locator('[data-action="skill2"]').click();
  await page.waitForFunction(()=>document.querySelector('#source-sequence').textContent.includes('스킬 2'),{},{timeout:15000});
  await page.locator('#source-reset').click();
  await page.screenshot({path:'previews/overlord-ready.png'});
  if(errors.length)throw Error(errors.join('\n'));
  const result={status:'passed',checks:['source scene loads','map position edit','Zhao Yun model and source bindings load','attack01 to attack02','B charge','A to B branch','reset'],pageErrors:errors};
  await fs.writeFile('reference/overlord/analysis/app-smoke.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
