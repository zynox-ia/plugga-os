# Licenças das fontes

- **General Sans** (`GeneralSans-*.woff2`): única família servida pelo app. Distribuída pela Indian Type Foundry sob a ITF Free Font License (uso pessoal e comercial). **A confirmar pelo dono**: o texto da licença não estava na pasta; o arquivo `Befonts-License.txt` que existia era o da Roobert ("Personal Use Only") e foi removido junto com ela.
- Removidas em 2026-10 (spec 002, T203): `Roobert*TRIAL*` (licença "Personal Use Only", proibida em produto entregue), `ArticulatCF-*`, `Anybody-*` e `AnekDevanagari-*`, que o app não referencia. O `globals.css` e os componentes não carregam essas famílias; os nomes de fallback no CSS apontam para General Sans.
- O mockup em `docs/mockup/assets/fonts/` usa `Anybody` e `Anek Devanagari` só como material de documentação.
