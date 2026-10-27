# SOUTH AFRICA EXPEDITION — especificação (pedido da Marina, 27/10/2026)

Gerenciador de viagem completo, responsivo e mobile-first, dentro do Marina OS.

## Contexto
- Viagem: África do Sul, 24/10 a 16/11/2026.
- Residência Cape Town: Student at Home Single Apartment Residence, 106 Adderley Street, Cape Town 8001.
- Escola: Bayswater Cape Town, 40 Shortmarket Street. Aulas segunda a quinta 09:00–15:10, sexta 09:00–12:20, até 13/11.
- Voo doméstico: SA366, CPT 13/11 às 19:35, JNB 21:35.
- Safári: Pilanesberg Tlou Tented, 14–15/11, pickup estimado 05:30–06:30, retorno 15/11 17:30–18:00. Ponto de pickup e reserva individual pendentes de confirmação.
- Voo internacional: JNB→GRU 16/11 11:10–16:15.
- Todas as horas no fuso local da atividade. Orçamento em ZAR.

## Roteiro base
- 28/10: escola + Lion's Head, início da trilha ~16:25, descer em grupo com iluminação.
- 29/10: 06:35 corrida Sea Point 5–6 km; escola; 16:00 piscina de água salgada.
- 30/10: escola até 12:20; 13:30 Table Mountain; 16:30 Camps Bay.
- 31/10: 07:30–18:30 excursão Cape Point, Cabo da Boa Esperança, Chapman's Peak e Boulders Beach.
- 01/11: 09:00 surf Muizenberg; 12:00 Kalk Bay; 14:15 Kirstenbosch.
- 02/11: escola + Bo-Kaap e Company's Garden.
- 03/11: escola + caiaque ~15:45, bike urbana ~17:00, sujeitos a disponibilidade.
- 04/11: escola + parapente ~16:00, sujeito a vento.
- 05/11: ausência escolar planejada; Gansbaai shark cage + Hermanus whale watching, somente se os dois horários e transfer forem compatíveis.
- 06/11: ausência da manhã escolar; Garden Route dia 1, Wilderness/Knysna.
- 07/11: Bloukrans bungee se houver liberação médica + Tsitsikamma.
- 08/11: retorno Garden Route.
- 09/11: snorkel com focas cedo, se houver saída; escola parcialmente; recuperação.
- 10/11: ausência escolar planejada; Stellenbosch gravel 54 km, 675 m, orçamento R4000; vinícola.
- 11/11: Discover Scuba supervisionado em kelp, possível ausência escolar adicional.
- 12/11: escola + atividade comunitária ética se houver projeto de tarde; arrumar malas.
- 13/11: escola até 12:20, check-out, CPT 19:35, JNB 21:35, hotel próximo ao aeroporto.
- 14–15/11: Pilanesberg, transfers e game drives.
- 16/11: chegar ao aeroporto até ~08:00; voo 11:10.

## Experiências extras não confirmadas
Robben Island, District Six Museum, sandboard/quadriciclo Atlantis, pedal guiado Chapman's Peak, tour histórico
Soweto/Constitution Hill/Apartheid Museum, Two Oceans Aquarium. Exibir como opcionais com o conflito e o custo de
oportunidade. Nunca marcar como concluído sem confirmação.

## Funcionalidades
1. Dashboard Hoje: clima real, temperatura, vento, ondas, nascer/pôr do sol, aulas, atividades, alertas, orçamento e próxima saída.
2. Calendário com visualização diária, semanal, linha do tempo e conflitos.
3. Cada atividade: horário de despertar, preparo, saída, endereço, rota, transporte, tempo, custo, roupa, checklist, contato, voucher, horário de retorno, risco e plano alternativo.
4. Orçamento: ZAR e BRL, valores estimados vs cotados vs pagos, custo Uber separado, totais, margem de 15%, registro de despesas reais.
5. Reservas: não pesquisado, cotação solicitada, aguardando confirmação, confirmado, pago, concluído, cancelado. Campos para URL, fornecedor, comprovante, política de cancelamento, pickup e contato.
6. Checklist inteligente por atividade: trilha, corrida, natação, surf, bike, scuba, safári, voo e voluntariado.
7. Escola: contar aulas preservadas, perdidas e repostas. Alertas antes de reservar passeio conflitante.
8. Segurança: horários diurnos, deslocamento acompanhado quando indicado, clima adverso, contatos de emergência, compartilhamento de itinerário com pessoa de confiança, limitações de mergulho e liberação médica para bungee.
9. Voluntariado: somente iniciativas éticas, orientadas pela comunidade, com regras de proteção infantil; diferenciar visita educativa de trabalho voluntário.
10. Replanejamento: diante de cancelamento por vento, chuva ou mar, sugerir trocas que respeitem distâncias, reservas, voos e aulas.
11. Mapa de destinos e rotas com origem na residência e na escola.
12. Integração opcional com calendário, previsão do tempo e mapas, caso APIs estejam disponíveis.
13. Exportar agenda em PDF, CSV e ICS, se a plataforma suportar.

## Regras de confiabilidade
- Nunca inventar disponibilidade, preço em tempo real, previsão meteorológica, rota, confirmação de reserva ou Uber exato.
- Distinguir CONFIRMADO, ESTIMADO, DEPENDENTE DE CLIMA e PENDENTE.
- Não apresentar uma atividade como garantida se depender de reserva ou liberação médica.
- Não alterar passagens ou criar reservas sem autorização.
- Visual elegante, estética editorial adventure travel, cartões diários, ícones discretos, excelente experiência mobile, interface em português.

Criar dados iniciais completos com o roteiro acima, permitir edição de todas as informações, persistir o estado e
oferecer um painel executivo de pendências e conflitos.
