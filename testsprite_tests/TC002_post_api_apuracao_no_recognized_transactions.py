import requests

def test_post_api_apuracao_no_recognized_transactions():
    base_url = "http://localhost:3000"
    endpoint = "/api/apuracao"
    url = base_url + endpoint

    # Basic auth credentials
    auth = ("maiconcorretorj@gmail.com", "Mayckinho96@@@")

    # Payload with valid schema but textoExtrato containing no recognizable transactions
    payload = {
        "textoExtrato": "This text does not contain any recognizable bank transaction data.",
        "nomeCliente": "Cliente Teste",
        "cpf": "12345678900",
        "hashPdf": "d41d8cd98f00b204e9800998ecf8427e"
    }

    headers = {
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers=headers,
            auth=auth,
            timeout=30
        )
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 422, f"Expected status 422 but got {response.status_code}"
    try:
        resp_json = response.json()
    except ValueError:
        resp_json = None

    if resp_json:
        # The error message should indicate no recognized transactions
        # We accept either a string error or an errors array/object
        error_text = ""
        if isinstance(resp_json, dict):
            # Try common keys for error info
            for key in ("error", "message", "errors", "detail"):
                if key in resp_json:
                    val = resp_json[key]
                    if isinstance(val, list):
                        error_text = " ".join(str(i) for i in val)
                    else:
                        error_text = str(val)
                    break
            if not error_text:
                # fallback: convert entire dict to string
                error_text = str(resp_json).lower()
        else:
            error_text = str(resp_json).lower()
        assert "no recognized transactions" in error_text.lower() or "nenhuma transação reconhecida" in error_text.lower(), \
            f"Expected error message indicating no recognized transactions, got: {error_text}"
    else:
        # No JSON body, ensure error message received via status code only
        pass

test_post_api_apuracao_no_recognized_transactions()