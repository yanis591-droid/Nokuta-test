// Fonction Netlify : crée une session de paiement Stripe Checkout à partir du panier.
// La clé secrète Stripe n'est JAMAIS dans le site : elle se met dans Netlify
// (Site configuration > Environment variables > STRIPE_SECRET_KEY).

const PRICE_EUR = 29; // doit être identique au prix affiché sur le site
const COLORS = {
  ivoire: "Ivoire", glacier: "Glacier", cendre: "Cendre", lilas: "Lilas",
  nuit: "Nuit", graphite: "Graphite", rose: "Rose"
};
const SIZES = ["S", "M", "L", "XL"];
// Pays où tu livres (à adapter)
const COUNTRIES = ["FR", "BE", "LU", "CH", "DE", "ES", "IT", "NL", "PT"];

const reply = (status, body) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Méthode non autorisée" });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return reply(500, { error: "Clé Stripe manquante" });

  let items;
  try { items = JSON.parse(event.body).items; } catch (e) { return reply(400, { error: "Requête invalide" }); }
  if (!Array.isArray(items) || items.length === 0 || items.length > 28) {
    return reply(400, { error: "Panier invalide" });
  }

  const params = new URLSearchParams();
  params.append("mode", "payment");

  for (let i = 0; i < items.length; i++) {
    const { id, size, qty } = items[i] || {};
    const q = Number(qty);
    if (!COLORS[id] || !SIZES.includes(size) || !Number.isInteger(q) || q < 1 || q > 10) {
      return reply(400, { error: "Article invalide" });
    }
    // Le prix et le nom viennent d'ici (serveur), jamais du navigateur.
    params.append(`line_items[${i}][quantity]`, String(q));
    params.append(`line_items[${i}][price_data][currency]`, "eur");
    params.append(`line_items[${i}][price_data][unit_amount]`, String(PRICE_EUR * 100));
    params.append(`line_items[${i}][price_data][product_data][name]`, `Crop Zip ${COLORS[id]} - Taille ${size}`);
  }

  COUNTRIES.forEach((c, i) => params.append(`shipping_address_collection[allowed_countries][${i}]`, c));

  const origin = process.env.SITE_URL || event.headers.origin || `https://${event.headers.host}`;
  params.append("success_url", `${origin}/?paiement=ok`);
  params.append("cancel_url", `${origin}/`);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const data = await res.json();
  if (!res.ok || !data.url) return reply(502, { error: "Stripe a refusé la requête" });

  return reply(200, { url: data.url });
};
