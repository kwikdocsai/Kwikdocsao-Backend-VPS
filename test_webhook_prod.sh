curl -X POST "https://backend-kwikdocs-kwikdocs-backend.wlv4pu.easypanel.host/api/webhooks/n8n/completed" \
     -H "Content-Type: application/json" \
     -d '[
  {
    "output": {
      "emitente": {
        "file_id": "decoangola.PNG",
        "nome": "BECOANGOLA, LDA",
        "nif": "541702997"
      },
      "decisao_final": {
        "status": "APROVADA_COM_RESSALVAS"
      },
      "totais": {
        "total_geral": 591675
      }
    }
  }
]'
