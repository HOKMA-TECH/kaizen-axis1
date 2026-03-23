import requests

def test_post_api_apuracao_valid_income_analysis():
    base_url = "http://localhost:3000"
    endpoint = "/api/apuracao"
    url = base_url + endpoint

    headers = {
        "Content-Type": "application/json"
    }

    payload = {
        "textoExtrato": (
            "01/01/2026 Saldo Salarial 5000.00\n"
            "15/01/2026 Pagamento Freelancer 1200.00\n"
            "01/02/2026 Saldo Salarial 5100.00\n"
            "15/02/2026 Pagamento Freelancer 1300.00\n"
            "01/03/2026 Saldo Salarial 5200.00\n"
            "15/03/2026 Pagamento Freelancer 1400.00"
        ),
        "nomeCliente": "Maicon Corretor",
        "cpf": "12345678900",
        "hashPdf": "hashdummystringforpdf1234567890"
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Expected status 200 but got {response.status_code}"
    data = response.json()

    assert isinstance(data, dict), "Response is not a JSON object"

    # Validate required response fields
    required_fields = [
        "transacoes", "totalApurado", "mediaMensalReal", "divisao6Meses",
        "divisao12Meses", "maiorMes", "menorMes", "mesesConsiderados", "avisos"
    ]

    for field in required_fields:
        assert field in data, f"Missing field '{field}' in response"

    assert isinstance(data["transacoes"], list), "'transacoes' should be a list"
    assert isinstance(data["totalApurado"], (int, float)), "'totalApurado' should be a number"
    assert isinstance(data["mediaMensalReal"], (int, float)), "'mediaMensalReal' should be a number"
    assert isinstance(data["divisao6Meses"], (int, float)), "'divisao6Meses' should be a number"
    assert isinstance(data["divisao12Meses"], (int, float)), "'divisao12Meses' should be a number"
    assert isinstance(data["maiorMes"], (int, float)), "'maiorMes' should be a number"
    assert isinstance(data["menorMes"], (int, float)), "'menorMes' should be a number"
    assert isinstance(data["mesesConsiderados"], (int, float)), "'mesesConsiderados' should be a number"
    assert isinstance(data["avisos"], list), "'avisos' should be a list"

    # Additional sanity checks for values
    assert data["totalApurado"] >= 0
    assert data["mediaMensalReal"] >= 0
    assert data["divisao6Meses"] >= 0
    assert data["divisao12Meses"] >= 0
    assert data["maiorMes"] >= 0
    assert data["menorMes"] >= 0
    assert data["mesesConsiderados"] > 0

test_post_api_apuracao_valid_income_analysis()