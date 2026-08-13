"""
Backend API Testing for White Label / Branding Feature
Tests all branding endpoints for Obelisco Manager
"""
import requests
import base64
import io
import uuid
from PIL import Image

# Backend URL from environment
BASE_URL = "https://saas-portal-21.preview.emergentagent.com/api"

# Test credentials
ADMIN_EMAIL = "admin@obelisco.pt"
ADMIN_PASSWORD = "obelisco2024"


def make_test_logo(rgb=(37, 99, 235)):
    """Create a test logo image as data URL"""
    image = Image.new("RGBA", (64, 64), rgb + (255,))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode()}"


class BrandingAPITests:
    def __init__(self):
        self.session = requests.Session()
        self.company_id = None
        self.test_results = []
        
    def log_result(self, test_name, passed, message, details=None):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "passed": passed,
            "message": message,
            "details": details
        })
        print(f"{status}: {test_name}")
        print(f"   {message}")
        if details:
            print(f"   Details: {details}")
        print()
        
    def test_1_public_branding_no_auth(self):
        """Test 1: GET /api/public/branding works without authentication"""
        print("\n" + "="*80)
        print("TEST 1: GET /api/public/branding (no authentication)")
        print("="*80)
        
        try:
            # Test without any authentication
            response = requests.get(f"{BASE_URL}/public/branding")
            
            if response.status_code == 200:
                data = response.json()
                company_name = data.get("company_name")
                branding = data.get("branding", {})
                palette = branding.get("palette", {})
                
                # Verify response structure
                has_company_name = bool(company_name)
                has_branding = bool(branding)
                has_palette = bool(palette)
                
                if has_company_name and has_branding and has_palette:
                    self.log_result(
                        "Public branding endpoint (no auth)",
                        True,
                        f"Public branding endpoint works without auth. Company: {company_name}",
                        f"Palette colors: {len(palette)} colors"
                    )
                    return True
                else:
                    self.log_result(
                        "Public branding endpoint (no auth)",
                        False,
                        "Response missing required fields",
                        f"company_name: {has_company_name}, branding: {has_branding}, palette: {has_palette}"
                    )
                    return False
            else:
                self.log_result(
                    "Public branding endpoint (no auth)",
                    False,
                    f"Expected 200, got {response.status_code}",
                    response.text[:200]
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Public branding endpoint (no auth)",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def test_2_login_and_get_company_id(self):
        """Test 2: Login as admin and get company_id"""
        print("\n" + "="*80)
        print("TEST 2: Admin Login")
        print("="*80)
        
        try:
            response = self.session.post(
                f"{BASE_URL}/auth/login",
                json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.company_id = data.get("company_id")
                token = data.get("access_token")
                
                if self.company_id and token:
                    # Set authorization header
                    self.session.headers.update({
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    })
                    
                    self.log_result(
                        "Admin login",
                        True,
                        f"Successfully logged in as admin",
                        f"Company ID: {self.company_id}"
                    )
                    return True
                else:
                    self.log_result(
                        "Admin login",
                        False,
                        "Login response missing company_id or token",
                        str(data)
                    )
                    return False
            else:
                self.log_result(
                    "Admin login",
                    False,
                    f"Login failed with status {response.status_code}",
                    response.text[:200]
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Admin login",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def test_3_logo_endpoint_with_tenant(self):
        """Test 3: GET /api/logo returns logo + branding by tenant"""
        print("\n" + "="*80)
        print("TEST 3: GET /api/logo (with company_id)")
        print("="*80)
        
        if not self.company_id:
            self.log_result(
                "Logo endpoint by tenant",
                False,
                "Cannot test: company_id not available (login failed)",
                None
            )
            return False
        
        try:
            response = self.session.get(
                f"{BASE_URL}/logo",
                params={"company_id": self.company_id}
            )
            
            if response.status_code == 200:
                data = response.json()
                logo = data.get("logo")
                branding = data.get("branding", {})
                company_name = data.get("company_name")
                
                has_logo = bool(logo)
                has_branding = bool(branding)
                has_company_name = bool(company_name)
                
                if has_logo and has_branding and has_company_name:
                    self.log_result(
                        "Logo endpoint by tenant",
                        True,
                        f"Logo endpoint returns complete data for tenant",
                        f"Company: {company_name}, Logo present: {logo[:50] if logo else 'None'}..."
                    )
                    return True
                else:
                    self.log_result(
                        "Logo endpoint by tenant",
                        False,
                        "Response missing required fields",
                        f"logo: {has_logo}, branding: {has_branding}, company_name: {has_company_name}"
                    )
                    return False
            else:
                self.log_result(
                    "Logo endpoint by tenant",
                    False,
                    f"Expected 200, got {response.status_code}",
                    response.text[:200]
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Logo endpoint by tenant",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def test_4_update_branding_with_logo(self):
        """Test 4: PUT /api/system-settings accepts branding.logo_data_url and persists"""
        print("\n" + "="*80)
        print("TEST 4: PUT /api/system-settings (upload custom logo)")
        print("="*80)
        
        if not self.company_id:
            self.log_result(
                "Update branding with custom logo",
                False,
                "Cannot test: company_id not available (login failed)",
                None
            )
            return False
        
        try:
            # Create a test logo with a specific color
            test_logo = make_test_logo((225, 29, 72))  # Red color
            
            # Update system settings with custom logo
            response = self.session.put(
                f"{BASE_URL}/system-settings",
                json={
                    "branding": {
                        "logo_data_url": test_logo
                    }
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                branding = data.get("branding", {})
                logo_data_url = branding.get("logo_data_url")
                source = branding.get("source")
                palette = branding.get("palette", {})
                
                # Verify logo was saved
                if logo_data_url and logo_data_url.startswith("data:image/png;base64,"):
                    # Verify it persisted by fetching again
                    verify_response = self.session.get(f"{BASE_URL}/system-settings")
                    if verify_response.status_code == 200:
                        verify_data = verify_response.json()
                        verify_logo = verify_data.get("branding", {}).get("logo_data_url")
                        
                        if verify_logo and verify_logo.startswith("data:image/png;base64,"):
                            self.log_result(
                                "Update branding with custom logo",
                                True,
                                "Custom logo uploaded and persisted successfully",
                                f"Source: {source}, Palette primary: {palette.get('primary', 'N/A')}"
                            )
                            return True
                        else:
                            self.log_result(
                                "Update branding with custom logo",
                                False,
                                "Logo not persisted correctly",
                                f"Verify logo: {verify_logo[:50] if verify_logo else 'None'}"
                            )
                            return False
                    else:
                        self.log_result(
                            "Update branding with custom logo",
                            False,
                            f"Verification GET failed with status {verify_response.status_code}",
                            verify_response.text[:200]
                        )
                        return False
                else:
                    self.log_result(
                        "Update branding with custom logo",
                        False,
                        "Logo not saved in response",
                        f"logo_data_url: {logo_data_url[:50] if logo_data_url else 'None'}"
                    )
                    return False
            else:
                self.log_result(
                    "Update branding with custom logo",
                    False,
                    f"Expected 200, got {response.status_code}",
                    response.text[:200]
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Update branding with custom logo",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def test_5_clear_logo_reset_branding(self):
        """Test 5: PUT /api/system-settings with branding.clear_logo=true resets to base"""
        print("\n" + "="*80)
        print("TEST 5: PUT /api/system-settings (clear_logo=true)")
        print("="*80)
        
        if not self.company_id:
            self.log_result(
                "Clear logo and reset branding",
                False,
                "Cannot test: company_id not available (login failed)",
                None
            )
            return False
        
        try:
            # Clear the logo
            response = self.session.put(
                f"{BASE_URL}/system-settings",
                json={
                    "branding": {
                        "clear_logo": True
                    }
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                branding = data.get("branding", {})
                source = branding.get("source")
                palette = branding.get("palette", {})
                primary_color = palette.get("primary")
                
                # Verify branding was reset to default
                # Default primary color should be #facc15 (from DEFAULT_BRANDING_PALETTE)
                is_default_source = source == "default"
                is_default_palette = primary_color == "#facc15"
                
                if is_default_source and is_default_palette:
                    self.log_result(
                        "Clear logo and reset branding",
                        True,
                        "Branding successfully reset to base/default",
                        f"Source: {source}, Primary color: {primary_color}"
                    )
                    return True
                else:
                    self.log_result(
                        "Clear logo and reset branding",
                        False,
                        "Branding not fully reset to default",
                        f"Source: {source} (expected 'default'), Primary: {primary_color} (expected '#facc15')"
                    )
                    return False
            else:
                self.log_result(
                    "Clear logo and reset branding",
                    False,
                    f"Expected 200, got {response.status_code}",
                    response.text[:200]
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Clear logo and reset branding",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def test_6_tenant_isolation(self):
        """Test 6: Verify tenant isolation - create new tenant and verify separate branding"""
        print("\n" + "="*80)
        print("TEST 6: Tenant Isolation")
        print("="*80)
        
        try:
            # Create a new tenant
            unique = uuid.uuid4().hex[:8]
            new_tenant_email = f"test-tenant-{unique}@example.com"
            new_tenant_company = f"Test Company {unique}"
            
            register_response = requests.post(
                f"{BASE_URL}/auth/register",
                json={
                    "name": f"Test User {unique}",
                    "email": new_tenant_email,
                    "password": "TestPassword123",
                    "company_name": new_tenant_company
                }
            )
            
            if register_response.status_code != 200:
                self.log_result(
                    "Tenant isolation",
                    False,
                    f"Failed to create test tenant: {register_response.status_code}",
                    register_response.text[:200]
                )
                return False
            
            new_tenant_data = register_response.json()
            new_company_id = new_tenant_data.get("company_id")
            new_token = new_tenant_data.get("access_token")
            
            if not new_company_id or not new_token:
                self.log_result(
                    "Tenant isolation",
                    False,
                    "New tenant registration missing company_id or token",
                    str(new_tenant_data)
                )
                return False
            
            # Create session for new tenant
            new_session = requests.Session()
            new_session.headers.update({
                "Authorization": f"Bearer {new_token}",
                "Content-Type": "application/json"
            })
            
            # Upload a different logo for the new tenant
            new_logo = make_test_logo((16, 185, 129))  # Green color
            
            upload_response = new_session.put(
                f"{BASE_URL}/system-settings",
                json={
                    "branding": {
                        "logo_data_url": new_logo
                    }
                }
            )
            
            if upload_response.status_code != 200:
                self.log_result(
                    "Tenant isolation",
                    False,
                    f"Failed to upload logo for new tenant: {upload_response.status_code}",
                    upload_response.text[:200]
                )
                return False
            
            # Verify original tenant's branding is unchanged
            original_response = self.session.get(f"{BASE_URL}/system-settings")
            if original_response.status_code != 200:
                self.log_result(
                    "Tenant isolation",
                    False,
                    f"Failed to fetch original tenant settings: {original_response.status_code}",
                    original_response.text[:200]
                )
                return False
            
            original_branding = original_response.json().get("branding", {})
            original_source = original_branding.get("source")
            
            # Verify new tenant's branding is different
            new_response = new_session.get(f"{BASE_URL}/system-settings")
            if new_response.status_code != 200:
                self.log_result(
                    "Tenant isolation",
                    False,
                    f"Failed to fetch new tenant settings: {new_response.status_code}",
                    new_response.text[:200]
                )
                return False
            
            new_branding = new_response.json().get("branding", {})
            new_source = new_branding.get("source")
            
            # Original tenant should have default branding (from test 5)
            # New tenant should have logo branding
            isolation_correct = (original_source == "default" and new_source == "logo")
            
            if isolation_correct:
                self.log_result(
                    "Tenant isolation",
                    True,
                    "Tenant isolation working correctly - each tenant has separate branding",
                    f"Original tenant: {original_source}, New tenant: {new_source}"
                )
                return True
            else:
                self.log_result(
                    "Tenant isolation",
                    False,
                    "Tenant isolation may be compromised",
                    f"Original tenant source: {original_source}, New tenant source: {new_source}"
                )
                return False
                
        except Exception as e:
            self.log_result(
                "Tenant isolation",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return False
    
    def run_all_tests(self):
        """Run all branding API tests"""
        print("\n" + "="*80)
        print("BRANDING API TESTS - OBELISCO MANAGER")
        print("Backend URL:", BASE_URL)
        print("="*80)
        
        # Run tests in sequence
        test_1_passed = self.test_1_public_branding_no_auth()
        test_2_passed = self.test_2_login_and_get_company_id()
        
        # Only run subsequent tests if login succeeded
        if test_2_passed:
            test_3_passed = self.test_3_logo_endpoint_with_tenant()
            test_4_passed = self.test_4_update_branding_with_logo()
            test_5_passed = self.test_5_clear_logo_reset_branding()
            test_6_passed = self.test_6_tenant_isolation()
        else:
            print("\n⚠️  Skipping tests 3-6 due to login failure")
            test_3_passed = False
            test_4_passed = False
            test_5_passed = False
            test_6_passed = False
        
        # Print summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for r in self.test_results if r["passed"])
        failed_tests = total_tests - passed_tests
        
        for result in self.test_results:
            status = "✅ PASS" if result["passed"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
        
        print("\n" + "-"*80)
        print(f"Total: {total_tests} tests")
        print(f"Passed: {passed_tests} tests")
        print(f"Failed: {failed_tests} tests")
        print("="*80)
        
        return failed_tests == 0


if __name__ == "__main__":
    tester = BrandingAPITests()
    success = tester.run_all_tests()
    
    if success:
        print("\n✅ ALL TESTS PASSED")
        exit(0)
    else:
        print("\n❌ SOME TESTS FAILED")
        exit(1)
