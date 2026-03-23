import requests
from requests.auth import HTTPBasicAuth

def test_post_api_apuracao_validation_error():
    base_url = "http://localhost:3000"
    endpoint = "/api/apuracao"
    url = base_url + endpoint
    auth = HTTPBasicAuth("maiconcorretorj@gmail.com", "Mayckinho96@@@")
    headers = {
        "Content-Type": "application/json"
    }
    # Missing required fields 'textoExtrato', 'nomeCliente', 'cpf', 'hashPdf'
    invalid_payloads = [
        {},  # empty body
        {"textoExtrato": "", "nomeCliente": "Cliente", "cpf": "12345678900"},  # missing hashPdf
        {"textoExtrato": "Some text", "nomeCliente": "", "cpf": "12345678900", "hashPdf": "hash"},  # empty nomeCliente
        {"textoExtrato": "Some text", "nomeCliente": "Cliente", "cpf": "invalid_cpf", "hashPdf": "hash"},  # invalid cpf format
        {"textoExtrato": "Some text", "nomeCliente": "Cliente", "cpf": "12345678900", "hashPdf": ""}  # empty hashPdf
    ]

    for payload in invalid_payloads:
        response = requests.post(url, json=payload, headers=headers, auth=auth, timeout=30)
        assert response.status_code in [400, 422], f"Expected status 400 or 422 but got {response.status_code} for payload: {payload}"
        # Optionally check response body content for a validation error message
        try:
            resp_json = response.json()
            assert "error" in resp_json or "message" in resp_json or resp_json == "Validation error", \
                f"Expected validation error message in response for payload: {payload}"
        except Exception:
            pass

test_post_api_apuracao_validation_error()