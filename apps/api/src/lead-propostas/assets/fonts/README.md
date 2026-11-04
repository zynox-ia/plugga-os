General Sans Regular e Medium: arquivos TTF oficiais copiados sem alteração do
[pacote General Sans do Fontshare](https://www.fontshare.com/fonts/general-sans),
distribuídos pela Indian Type Foundry sob a licença ITF FFL incluída em LICENSE.txt.

Uso interno da Plugga nos PDFs de propostas. As fontes ficam na própria API e são
copiadas pelo Nest para `dist/lead-propostas/assets/fonts`; o runtime não depende
de outra aplicação nem de download. O Docker da API já copia o build completo.

Os TTF preservam os contornos no PDFKit/fontkit. Os WOFF2 usados na web permitem
extração do texto, mas produziram glifos invisíveis na rasterização PDF; o teste
de PDF verifica os pixels do texto além da extração e da paginação.

Referências: [fontes e texto no PDFKit](https://pdfkit.org/docs/text.html),
[licença oficial](https://www.fontshare.com/licenses/itf-ffl).
