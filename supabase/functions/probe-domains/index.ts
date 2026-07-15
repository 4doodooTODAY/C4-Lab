Deno.serve(async (req) => {
  const H = { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }
  const { action } = await req.json().catch(() => ({}))
  const list = async () => (await (await fetch('https://api.resend.com/domains', { headers: H })).json()).data || []
  if (action === 'swap') {
    const doms = await list()
    const old = doms.find((d: { name: string }) => d.name === 'connectfourcreative.com')
    if (old) await fetch(`https://api.resend.com/domains/${old.id}`, { method: 'DELETE', headers: H })
    const res = await fetch('https://api.resend.com/domains', {
      method: 'POST', headers: H, body: JSON.stringify({ name: 'c4clab.com', region: 'us-east-1' }),
    })
    return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } })
  }
  if (action === 'verify') {
    const doms = await list()
    const dom = doms.find((d: { name: string }) => d.name === 'c4clab.com')
    if (!dom) return new Response('{"error":"not found"}')
    await fetch(`https://api.resend.com/domains/${dom.id}/verify`, { method: 'POST', headers: H })
    const detail = await (await fetch(`https://api.resend.com/domains/${dom.id}`, { headers: H })).json()
    return new Response(JSON.stringify(detail), { headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify(await list()), { headers: { 'Content-Type': 'application/json' } })
})
