const URL='https://ttgcrcloioznojreogwn.supabase.co';
const KEY='';
const H={apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'};
async function get(p){const r=await fetch(URL+'/rest/v1/'+p,{headers:H});return r.json();}
(async()=>{
  // только клиент Сурайе Опа, только накладные со СМЕШАННЫМИ флагами оплаты
  const cust=(await get('customers?select=id,name&name=ilike.*сура*'))[0];
  if(!cust){console.log('клиент не найден');return;}
  const sales=await get('sales?select=id,date,items&customer_id=eq.'+cust.id);
  for(const s of sales){
    const items=s.items||[]; const pc=items.filter(i=>i.paid).length;
    if(pc>0 && pc<items.length){
      const nw=items.map(i=>({...i,paid:false}));
      const r=await fetch(URL+'/rest/v1/sales?id=eq.'+s.id,{method:'PATCH',headers:{...H,Prefer:'return=minimal'},body:JSON.stringify({items:nw})});
      console.log('Исправлена накладная', s.date?.slice(0,10),'id',s.id.slice(0,8),'(было оплачено',pc,'из',items.length,'→ все «в долг») status', r.status);
    }
  }
  console.log('Готово.');
})();
