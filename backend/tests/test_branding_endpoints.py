"""
Test branding endpoints for White Label feature
"""
import requests
import os
import base64
import io
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dynamic-colors-2.preview.emergentagent.com')

def make_test_logo(rgb=(37, 99, 235)):
    """Create a test logo image as data URL"""
    image = Image.new("RGBA", (64, 64), rgb + (255,))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode()}"

def test_public_branding_endpoint():
    """Test GET /api/public/branding - should work without auth"""
    print("\n=== Testing GET /api/public/branding ===")
    response = requests.get(f"{BASE_URL}/api/public/branding")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Company name: {data.get('company_name')}")
        print(f"Branding source: {data.get('branding', {}).get('source')}")
        print(f"Primary color: {data.get('branding', {}).get('palette', {}).get('primary')}")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_logo_endpoint_without_auth():
    """Test GET /api/logo - should work without auth"""
    print("\n=== Testing GET /api/logo (no auth) ===")
    response = requests.get(f"{BASE_URL}/api/logo")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Company name: {data.get('company_name')}")
        print(f"Has logo: {bool(data.get('logo'))}")
        print(f"Branding source: {data.get('branding', {}).get('source')}")
        return True
    else:
        print(f"Error: {response.text}")
        return False

def test_authenticated_branding_flow():
    """Test full branding flow with authentication"""
    print("\n=== Testing authenticated branding flow ===")
    
    # Login
    session = requests.Session()
    login_response = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@obelisco.pt", "password": "obelisco2024"}
    )
    
    if login_response.status_code != 200:
        print(f"Login failed: {login_response.text}")
        return False
    
    login_data = login_response.json()
    token = login_data.get('access_token')
    company_id = login_data.get('company_id')
    print(f"✓ Logged in as admin, company_id: {company_id}")
    
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    
    # Get current system settings
    print("\n--- GET /api/system-settings ---")
    settings_response = session.get(f"{BASE_URL}/api/system-settings")
    print(f"Status: {settings_response.status_code}")
    if settings_response.status_code == 200:
        settings = settings_response.json()
        print(f"Company info name: {settings.get('company_info', {}).get('name')}")
        print(f"Current branding source: {settings.get('branding', {}).get('source')}")
        print(f"Current primary color: {settings.get('branding', {}).get('palette', {}).get('primary')}")
    else:
        print(f"Error: {settings_response.text}")
        return False
    
    # Test logo endpoint with company_id
    print(f"\n--- GET /api/logo?company_id={company_id} ---")
    logo_response = session.get(f"{BASE_URL}/api/logo", params={"company_id": company_id})
    print(f"Status: {logo_response.status_code}")
    if logo_response.status_code == 200:
        logo_data = logo_response.json()
        print(f"Company name: {logo_data.get('company_name')}")
        print(f"Has logo: {bool(logo_data.get('logo'))}")
    else:
        print(f"Error: {logo_response.text}")
    
    # Test public branding with company_id
    print(f"\n--- GET /api/public/branding?company_id={company_id} ---")
    public_response = requests.get(f"{BASE_URL}/api/public/branding", params={"company_id": company_id})
    print(f"Status: {public_response.status_code}")
    if public_response.status_code == 200:
        public_data = public_response.json()
        print(f"Company ID matches: {public_data.get('company_id') == company_id}")
        print(f"Company name: {public_data.get('company_name')}")
    else:
        print(f"Error: {public_response.text}")
    
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("BRANDING ENDPOINTS TEST")
    print("=" * 60)
    
    results = []
    results.append(("Public branding endpoint", test_public_branding_endpoint()))
    results.append(("Logo endpoint (no auth)", test_logo_endpoint_without_auth()))
    results.append(("Authenticated branding flow", test_authenticated_branding_flow()))
    
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")
