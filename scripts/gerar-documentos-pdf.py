# =====================================================================
#  StartBookings — gera os documentos juridicos em PDF, prontos para
#  apresentacao e assinatura.
#
#  POR QUE UM GERADOR, E NAO PDFs SOLTOS NO REPOSITORIO
#   Os textos vivem em docs/*.md, que e onde sao revisados e versionados.
#   Gerar sob demanda garante que o PDF nunca fique defasado em relacao ao
#   markdown — basta rodar de novo depois de preencher os dados da empresa
#   ou de aplicar as correcoes do advogado.
#
#  COMO USAR
#    python scripts/gerar-documentos-pdf.py
#
#  Saida: %USERPROFILE%\StartBookings-Documentos\
# =====================================================================

import html
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = Path(os.path.expanduser("~")) / "StartBookings-Documentos"
LOGO = RAIZ / "assets" / "img" / "logo-print.png"

# (arquivo, titulo, assina?)  — os internos tambem sao aprovados pela direcao
DOCUMENTOS = [
    ("apresentacao-documentos-lgpd.md", "Apresentação à Direção", False),
    ("politica-de-privacidade.md",      "Política de Privacidade", True),
    ("termos-de-uso.md",                "Termos de Uso", True),
    ("lgpd-registro-operacoes-e-lia.md","Registro de Operações e LIA", True),
    ("lgpd-plano-incidentes-e-ripd.md", "Plano de Incidentes e RIPD", True),
]

CSS = """
@page { size: A4; margin: 20mm 18mm 22mm; }
* { box-sizing: border-box; }
body {
  margin: 0; color: #1a1a1e; background: #fff;
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.6;
}
.cab {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 20px; padding-bottom: 10px; border-bottom: 2px solid #1a1a1e; margin-bottom: 22px;
}
.cab img { height: 38px; }
.cab .tipo {
  text-align: right; font-size: 11pt; font-weight: 700;
  letter-spacing: .05em; text-transform: uppercase;
}
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 14px; letter-spacing: -.01em; }
h2 {
  font-size: 13pt; margin: 26px 0 8px; padding-bottom: 4px;
  border-bottom: 1px solid #d6d6dc; page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 18px 0 6px; page-break-after: avoid; }
p { margin: 0 0 9px; }
ul, ol { margin: 0 0 9px; padding-left: 20px; }
li { margin-bottom: 4px; }
strong { font-weight: 600; }
code {
  font-family: Consolas, "Courier New", monospace; font-size: .9em;
  background: #f1f1f5; padding: 1px 4px; border-radius: 2px;
}
table {
  width: 100%; border-collapse: collapse; margin: 12px 0;
  font-size: 9.5pt; page-break-inside: avoid;
}
th, td { border: 1px solid #d6d6dc; padding: 6px 9px; text-align: left; vertical-align: top; }
th { background: #f4f4f7; font-weight: 600; }
blockquote {
  border-left: 3px solid #bf9100; background: #faf7ec;
  margin: 12px 0; padding: 9px 14px; page-break-inside: avoid;
}
blockquote p:last-child { margin-bottom: 0; }
hr { border: 0; border-top: 1px solid #d6d6dc; margin: 20px 0; }

/* Campos que a empresa precisa preencher — impossivel passar despercebido */
.preencher {
  background: #fff3c4; border: 1px solid #d9a300; border-radius: 3px;
  padding: 1px 5px; font-weight: 600; white-space: nowrap;
}

.aviso {
  border: 1.5px solid #b3261e; background: #fbeceb; color: #7d1b16;
  padding: 10px 14px; margin: 0 0 20px; font-size: 9.5pt; border-radius: 3px;
}
.aviso strong { color: #7d1b16; }

/* Bloco de assinatura */
.assinatura { margin-top: 40px; page-break-inside: avoid; }
.assinatura h2 { border: none; margin-bottom: 14px; }
.assinatura .local { margin-bottom: 34px; }
.linha { border-top: 1px solid #1a1a1e; width: 74%; margin: 0 0 5px; }
.assinatura .campo { font-size: 9.5pt; color: #45454c; margin: 0 0 3px; }
"""


def md_para_html(md: str) -> str:
    """Conversor de Markdown suficiente para estes documentos."""
    # O PDF ja traz o banner vermelho de "documento em revisao"; repetir o
    # mesmo aviso vindo do markdown polui a pagina. Remove o bloco de citacao
    # inteiro (linhas consecutivas iniciadas por ">") que o contenha.
    cru, limpo, bloco = md.split(chr(10)), [], []
    for _ln in cru:
        if _ln.startswith(">"):
            bloco.append(_ln)
            continue
        if bloco:
            if not any("ANTES DE PUBLICAR" in b for b in bloco):
                limpo.extend(bloco)
            bloco = []
        limpo.append(_ln)
    if bloco and not any("ANTES DE PUBLICAR" in b for b in bloco):
        limpo.extend(bloco)
    md = chr(10).join(limpo)
    linhas = md.split("\n")
    out, em_tabela, em_lista, em_quote = [], False, None, False
    paragrafo = []   # linhas soltas viram UM paragrafo, nao um por linha

    def inline(t: str) -> str:
        t = html.escape(t)
        t = t.replace("[PREENCHER]", '<span class="preencher">PREENCHER</span>')
        t = re.sub(r"\[PREENCHER:([^\]]+)\]", r'<span class="preencher">\1</span>', t)
        t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
        t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
        t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", t)
        t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", t)   # links viram texto
        return t

    def fecha_lista():
        nonlocal em_lista
        if em_lista:
            out.append(f"</{em_lista}>")
            em_lista = None

    def fecha_quote():
        nonlocal em_quote
        if em_quote:
            out.append("</blockquote>")
            em_quote = False

    def fecha_paragrafo():
        if paragrafo:
            out.append(f"<p>{inline(' '.join(paragrafo))}</p>")
            paragrafo.clear()

    for ln in linhas:
        s = ln.rstrip()

        if s.startswith("|"):
            fecha_paragrafo()
            fecha_lista(); fecha_quote()
            celulas = [c.strip() for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in celulas):
                continue
            tag = "td"
            if not em_tabela:
                out.append("<table><tr>"); em_tabela = True; tag = "th"
            else:
                out.append("<tr>")
            out.extend(f"<{tag}>{inline(c)}</{tag}>" for c in celulas)
            out.append("</tr>")
            continue
        if em_tabela:
            out.append("</table>"); em_tabela = False

        if s.startswith("> "):
            fecha_paragrafo()
            fecha_lista()
            if not em_quote:
                out.append("<blockquote>"); em_quote = True
            out.append(f"<p>{inline(s[2:])}</p>")
            continue
        fecha_quote()

        if s.startswith("### "):
            fecha_paragrafo()
            fecha_lista(); out.append(f"<h3>{inline(s[4:])}</h3>"); continue
        if s.startswith("## "):
            fecha_paragrafo()
            fecha_lista(); out.append(f"<h2>{inline(s[3:])}</h2>"); continue
        if s.startswith("# "):
            fecha_paragrafo()
            fecha_lista(); out.append(f"<h1>{inline(s[2:])}</h1>"); continue
        if s.startswith("---"):
            fecha_paragrafo()
            fecha_lista(); out.append("<hr>"); continue

        m = re.match(r"^(\d+)\. (.*)", s)
        if m:
            fecha_paragrafo()
            if em_lista != "ol":
                fecha_lista(); out.append("<ol>"); em_lista = "ol"
            out.append(f"<li>{inline(m.group(2))}</li>"); continue
        if s.startswith("- ") or s.startswith("* "):
            fecha_paragrafo()
            if em_lista != "ul":
                fecha_lista(); out.append("<ul>"); em_lista = "ul"
            out.append(f"<li>{inline(s[2:])}</li>"); continue

        if s.strip():
            # Markdown quebra itens longos em varias linhas. Sem isto, a
            # continuacao virava um paragrafo solto fora da lista.
            if em_lista and not paragrafo and out and out[-1].endswith("</li>"):
                out[-1] = out[-1][:-5] + " " + inline(s.strip()) + "</li>"
            else:
                fecha_lista()
                paragrafo.append(s.strip())
        else:
            fecha_paragrafo(); fecha_lista()

    fecha_paragrafo(); fecha_lista(); fecha_quote()
    if em_tabela:
        out.append("</table>")
    return "\n".join(out)


BLOCO_ASSINATURA = """
<div class="assinatura">
  <h2>Aprovação e assinatura</h2>
  <p>Declaro ter lido e aprovado o conteúdo deste documento, que passa a vigorar
  a partir da data abaixo.</p>
  <p class="local">Local e data: ______________________________________________</p>
  <div class="linha"></div>
  <p class="campo">Assinatura do representante legal</p>
  <p class="campo">Nome: ______________________________________________</p>
  <p class="campo">CPF: ____________________  Cargo: ____________________</p>
</div>
"""

AVISO = """
<div class="aviso">
  <strong>Documento em revisão — não assinar ainda.</strong>
  Os campos destacados em amarelo precisam ser preenchidos com os dados da
  empresa, e o texto deve passar por revisão de advogado antes da assinatura.
  Este PDF serve para leitura, coleta das informações e aprovação prévia.
</div>
"""


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)
    logo_uri = ""
    if LOGO.exists():
        import base64
        logo_uri = "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()

    with sync_playwright() as p:
        navegador = p.chromium.launch()
        pagina = navegador.new_page()

        for arquivo, titulo, assina in DOCUMENTOS:
            origem = RAIZ / "docs" / arquivo
            if not origem.exists():
                print(f"  [!] nao encontrado: {arquivo}")
                continue

            md = origem.read_text(encoding="utf-8")
            corpo = md_para_html(md)
            tem_preencher = "PREENCHER" in md

            doc = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>{html.escape(titulo)}</title><style>{CSS}</style></head><body>
<div class="cab">
  <img src="{logo_uri}" alt="StartBookings">
  <div class="tipo">{html.escape(titulo)}</div>
</div>
{AVISO if tem_preencher else ""}
{corpo}
{BLOCO_ASSINATURA if assina else ""}
</body></html>"""

            temp = SAIDA / "_tmp.html"
            temp.write_text(doc, encoding="utf-8")
            pagina.goto(temp.as_uri(), wait_until="networkidle")

            destino = SAIDA / (origem.stem + ".pdf")
            pagina.pdf(
                path=str(destino), format="A4", print_background=True,
                display_header_footer=True,
                header_template="<div></div>",
                footer_template=(
                    '<div style="width:100%;font-size:8pt;color:#6b6b72;'
                    'padding:0 18mm;display:flex;justify-content:space-between;">'
                    "<span>StartBookings — " + html.escape(titulo) + "</span>"
                    '<span>Página <span class="pageNumber"></span> de '
                    '<span class="totalPages"></span></span></div>'
                ),
                margin={"top": "20mm", "bottom": "22mm", "left": "18mm", "right": "18mm"},
            )
            kb = destino.stat().st_size // 1024
            marca = " (com campos a preencher)" if tem_preencher else ""
            print(f"  {destino.name:44} {kb:>4} KB{marca}")

        temp.unlink(missing_ok=True)
        navegador.close()

    print(f"\nDocumentos gerados em: {SAIDA}")


if __name__ == "__main__":
    main()
