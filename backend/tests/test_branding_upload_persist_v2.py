"""
Test branding upload and persistence flow - v2
"""
import requests
import os
import base64
import io
import uuid
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://dynamic-colors-2.preview.emergentagent.com')

def make_test_logo(rgb=(37, 99, 235)):
    """Create a test logo image as data URL"""
    image = Image.new("RGBA", (64, 64), rgb + (255,))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode()}"

def test_upload_logo_and_persist():
    """Test uploading a logo and verifying it persists"""
    print("\n=== Testing Logo Upload and Persistence ===")
    
    # Create a new tenant for isolated testing
    unique = uuid.uuid4().hex[:8]
    session = requests.Session()
    
    # Register new tenant
    register_response = session.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "name": f"Branding Test {unique}",
            "email": f"branding-persist-{unique}@example.com",
            "password": "BrandingTest123",
            "company_name": f"Branding Persist Tenant {unique}",
        },
    )
    
    if register_response.status_code != 200:
        print(f"✗ Registration failed: {register_response.text}")
        return False
    
    reg_data = register_response.json()
    token = reg_data.get('access_token')
    company_id = reg_data.get('company_id')
    company_name = reg_data.get('company_name')
    print(f"✓ Created new tenant: {company_name} (ID: {company_id})")
    
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    
    # Get initial branding state
    print("\n--- Initial branding state ---")
    initial_settings = session.get(f"{BASE_URL}/api/system-settings").json()
    initial_source = initial_settings.get('branding', {}).get('source')
    initial_primary = initial_settings.get('branding', {}).get('palette', {}).get('primary')
    print(f"Initial source: {initial_source}")
    print(f"Initial primary color: {initial_primary}")
    
    # Upload a custom logo (blue color)
    print("\n--- Uploading custom logo ---")
    test_logo = make_test_logo((37, 99, 235))  # Blue logo
    
    update_response = session.put(
        f"{BASE_URL}/api/system-settings",
        json={
            "branding": {"logo_data_url": test_logo},
            "company_info": {"name": company_name},
        },
    )
    
    if update_response.status_code != 200:
        print(f"✗ Logo upload failed: {update_response.text}")
        return False
    
    update_data = update_response.json()
    new_source = update_data.get('branding', {}).get('source')
    new_logo = update_data.get('branding', {}).get('logo_data_url')
    new_primary = update_data.get('branding', {}).get('palette', {}).get('primary')
    
    print(f"✓ Logo uploaded successfully")
    print(f"  New source: {new_source}")
    print(f"  Has logo: {'Yes' if new_logo else 'No'}")
    print(f"  New primary color: {new_primary}")
    
    # Verify source changed from default to logo
    if new_source != 'logo':
        print(f"✗ Expected source 'logo', got '{new_source}'")
        return False
    
    # Verify logo is stored
    if not new_logo or not new_logo.startswith('data:image/png;base64,'):
        print(f"✗ Logo not properly stored")
        return False
    
    # Verify primary color changed (should not be default yellow #facc15)
    if new_primary == '#facc15':
        print(f"✗ Primary color should have changed from default")
        return False
    
    print(f"✓ Primary color changed to: {new_primary}")
    
    # Verify persistence - fetch settings again
    print("\n--- Verifying persistence ---")
    persisted_settings = session.get(f"{BASE_URL}/api/system-settings").json()
    persisted_source = persisted_settings.get('branding', {}).get('source')
    persisted_logo = persisted_settings.get('branding', {}).get('logo_data_url')
    persisted_primary = persisted_settings.get('branding', {}).get('palette', {}).get('primary')
    
    if persisted_source != 'logo':
        print(f"✗ Persisted source mismatch: expected 'logo', got '{persisted_source}'")
        return False
    
    if not persisted_logo:
        print(f"✗ Logo not persisted")
        return False
    
    if persisted_primary != new_primary:
        print(f"✗ Primary color not persisted: expected '{new_primary}', got '{persisted_primary}'")
        return False
    
    print(f"✓ Branding persisted correctly")
    print(f"  Source: {persisted_source}")
    print(f"  Has logo: Yes")
    print(f"  Primary color: {persisted_primary}")
    
    return True

def test_reset_branding():
    """Test resetting branding to default"""
    print("\n=== Testing Branding Reset ===")
    
    # Create a new tenant for isolated testing
    unique = uuid.uuid4().hex[:8]
    session = requests.Session()
    
    # Register new tenant
    register_response = session.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "name": f"Reset Test {unique}",
            "email": f"branding-reset-{unique}@example.com",
            "password": "ResetTest123",
            "company_name": f"Reset Test Tenant {unique}",
        },
    )
    
    if register_response.status_code != 200:
        print(f"✗ Registration failed: {register_response.text}")
        return False
    
    reg_data = register_response.json()
    token = reg_data.get('access_token')
    company_name = reg_data.get('company_name')
    print(f"✓ Created new tenant: {company_name}")
    
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    })
    
    # Upload a custom logo first
    print("\n--- Uploading custom logo ---")
    test_logo = make_test_logo((225, 29, 72))  # Red logo
    
    update_response = session.put(
        f"{BASE_URL}/api/system-settings",
        json={"branding": {"logo_data_url": test_logo}},
    )
    
    if update_response.status_code != 200:
        print(f"✗ Logo upload failed: {update_response.text}")
        return False
    
    update_data = update_response.json()
    custom_primary = update_data.get('branding', {}).get('palette', {}).get('primary')
    print(f"✓ Custom logo uploaded, primary color: {custom_primary}")
    
    # Reset branding
    print("\n--- Resetting branding ---")
    reset_response = session.put(
        f"{BASE_URL}/api/system-settings",
        json={"branding": {"clear_logo": True, "logo_data_url": None}},
    )
    
    if reset_response.status_code != 200:
        print(f"✗ Reset failed: {reset_response.text}")
        return False
    
    reset_data = reset_response.json()
    reset_source = reset_data.get('branding', {}).get('source')
    reset_primary = reset_data.get('branding', {}).get('palette', {}).get('primary')
    
    print(f"✓ Branding reset")
    print(f"  Source: {reset_source}")
    print(f"  Primary color: {reset_primary}")
    
    # Verify reset to default
    if reset_source != 'default':
        print(f"✗ Expected source 'default', got '{reset_source}'")
        return False
    
    if reset_primary != '#facc15':
        print(f"✗ Primary color should be default #facc15, got '{reset_primary}'")
        return False
    
    # Note: The logo_data_url will still have a value (the default logo from logo.png)
    # This is expected behavior - reset means going back to default branding, not removing logo entirely
    
    print(f"✓ Branding reset to default successfully")
    
    return True

def test_tenant_isolation():
    """Test that branding is isolated per tenant"""
    print("\n=== Testing Tenant Isolation ===")
    
    # Create two tenants
    unique1 = uuid.uuid4().hex[:8]
    unique2 = uuid.uuid4().hex[:8]
    
    session1 = requests.Session()
    session2 = requests.Session()
    
    # Register tenant 1
    reg1 = session1.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "name": f"Tenant1 {unique1}",
            "email": f"tenant1-{unique1}@example.com",
            "password": "Tenant1Test123",
            "company_name": f"Tenant 1 Company {unique1}",
        },
    )
    
    if reg1.status_code != 200:
        print(f"✗ Tenant 1 registration failed: {reg1.text}")
        return False
    
    data1 = reg1.json()
    session1.headers.update({
        "Authorization": f"Bearer {data1.get('access_token')}",
        "Content-Type": "application/json"
    })
    print(f"✓ Created tenant 1: {data1.get('company_name')}")
    
    # Register tenant 2
    reg2 = session2.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "name": f"Tenant2 {unique2}",
            "email": f"tenant2-{unique2}@example.com",
            "password": "Tenant2Test123",
            "company_name": f"Tenant 2 Company {unique2}",
        },
    )
    
    if reg2.status_code != 200:
        print(f"✗ Tenant 2 registration failed: {reg2.text}")
        return False
    
    data2 = reg2.json()
    session2.headers.update({
        "Authorization": f"Bearer {data2.get('access_token')}",
        "Content-Type": "application/json"
    })
    print(f"✓ Created tenant 2: {data2.get('company_name')}")
    
    # Upload different logos to each tenant
    print("\n--- Uploading different logos ---")
    
    # Tenant 1: Blue logo
    blue_logo = make_test_logo((37, 99, 235))
    resp1 = session1.put(
        f"{BASE_URL}/api/system-settings",
        json={"branding": {"logo_data_url": blue_logo}},
    )
    if resp1.status_code != 200:
        print(f"✗ Tenant 1 logo upload failed")
        return False
    tenant1_primary = resp1.json().get('branding', {}).get('palette', {}).get('primary')
    print(f"✓ Tenant 1 primary color: {tenant1_primary}")
    
    # Tenant 2: Red logo
    red_logo = make_test_logo((225, 29, 72))
    resp2 = session2.put(
        f"{BASE_URL}/api/system-settings",
        json={"branding": {"logo_data_url": red_logo}},
    )
    if resp2.status_code != 200:
        print(f"✗ Tenant 2 logo upload failed")
        return False
    tenant2_primary = resp2.json().get('branding', {}).get('palette', {}).get('primary')
    print(f"✓ Tenant 2 primary color: {tenant2_primary}")
    
    # Verify colors are different
    if tenant1_primary == tenant2_primary:
        print(f"✗ Tenant colors should be different")
        return False
    
    # Verify each tenant sees their own branding
    print("\n--- Verifying isolation ---")
    
    settings1 = session1.get(f"{BASE_URL}/api/system-settings").json()
    settings2 = session2.get(f"{BASE_URL}/api/system-settings").json()
    
    if settings1.get('branding', {}).get('palette', {}).get('primary') != tenant1_primary:
        print(f"✗ Tenant 1 branding not isolated")
        return False
    
    if settings2.get('branding', {}).get('palette', {}).get('primary') != tenant2_primary:
        print(f"✗ Tenant 2 branding not isolated")
        return False
    
    print(f"✓ Tenant branding is properly isolated")
    
    # Verify public branding endpoints return correct tenant branding
    print("\n--- Verifying public branding isolation ---")
    
    public1 = requests.get(f"{BASE_URL}/api/public/branding", params={"company_id": data1.get('company_id')}).json()
    public2 = requests.get(f"{BASE_URL}/api/public/branding", params={"company_id": data2.get('company_id')}).json()
    
    if public1.get('branding', {}).get('palette', {}).get('primary') != tenant1_primary:
        print(f"✗ Public branding for tenant 1 incorrect")
        return False
    
    if public2.get('branding', {}).get('palette', {}).get('primary') != tenant2_primary:
        print(f"✗ Public branding for tenant 2 incorrect")
        return False
    
    print(f"✓ Public branding endpoints return correct tenant-specific branding")
    
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("BRANDING UPLOAD AND PERSISTENCE TEST v2")
    print("=" * 60)
    
    results = []
    results.append(("Upload logo and persist", test_upload_logo_and_persist()))
    results.append(("Reset branding", test_reset_branding()))
    results.append(("Tenant isolation", test_tenant_isolation()))
    
    print("\n" + "=" * 60)
    print("RESULTS SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(passed for _, passed in results)
    print(f"\nOverall: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
