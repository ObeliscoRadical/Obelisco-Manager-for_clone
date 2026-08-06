"""
Obelisco Manager - Discount and Payment Features Tests
Tests for: Per-item discount, Global discount, Payment methods/split/notes, Proposal propagation
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


@pytest.fixture
def auth_session():
    """Create authenticated session"""
    session = requests.Session()
    response = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": os.environ.get("TEST_ADMIN_EMAIL", "admin@obelisco.pt"),
        "password": os.environ.get("TEST_ADMIN_PASSWORD", "obelisco2024")
    })
    if response.status_code != 200:
        pytest.skip("Authentication failed")
    return session


class TestBudgetDiscountCalculation:
    """Tests for per-item and global discount calculation"""
    
    def test_budget_with_per_item_value_discount(self, auth_session):
        """Test budget with per-item value discount (EUR)"""
        # Item A: 10 qty × 50 cost × 1.6 margin = 800, then -5€ discount = 795
        payload = {
            "title": f"TEST_ItemDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Discount_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item A",
                    "quantity": 10,
                    "unit_cost": 50.0,
                    "margin": 0.6,
                    "discount_type": "value",
                    "discount_value": 5.0
                }
            ],
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "50% no inicio, 50% na conclusao"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify: 10 * 50 * 1.6 = 800, then -5 = 795
        assert data["total_price"] == 795.0, f"Expected 795.0, got {data['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_budget_with_per_item_percentage_discount(self, auth_session):
        """Test budget with per-item percentage discount"""
        # Item B: 5 qty × 100 cost × 1.5 margin = 750, then -10% = 675
        payload = {
            "title": f"TEST_ItemPctDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Discount_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item B",
                    "quantity": 5,
                    "unit_cost": 100.0,
                    "margin": 0.5,
                    "discount_type": "percentage",
                    "discount_value": 10.0
                }
            ],
            "payment_methods": ["MB Way"],
            "payment_split": "100% na conclusao"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify: 5 * 100 * 1.5 = 750, then * 0.9 = 675
        assert data["total_price"] == 675.0, f"Expected 675.0, got {data['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_budget_with_global_percentage_discount(self, auth_session):
        """Test budget with global percentage discount"""
        # Item: 10 qty × 100 cost × 1.5 margin = 1500, then -20% global = 1200
        payload = {
            "title": f"TEST_GlobalPctDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Discount_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item",
                    "quantity": 10,
                    "unit_cost": 100.0,
                    "margin": 0.5
                }
            ],
            "discount_type": "percentage",
            "discount_value": 20.0,
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "50% no inicio, 50% na conclusao"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify: 10 * 100 * 1.5 = 1500, then * 0.8 = 1200
        assert data["total_price"] == 1200.0, f"Expected 1200.0, got {data['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_budget_with_global_value_discount(self, auth_session):
        """Test budget with global value discount (EUR)"""
        # Item: 10 qty × 100 cost × 1.5 margin = 1500, then -100€ global = 1400
        payload = {
            "title": f"TEST_GlobalValDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Discount_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item",
                    "quantity": 10,
                    "unit_cost": 100.0,
                    "margin": 0.5
                }
            ],
            "discount_type": "value",
            "discount_value": 100.0,
            "payment_methods": ["Numerario"],
            "payment_split": "100% adiantado"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify: 10 * 100 * 1.5 = 1500, then -100 = 1400
        assert data["total_price"] == 1400.0, f"Expected 1400.0, got {data['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_budget_combined_item_and_global_discount(self, auth_session):
        """Test budget with BOTH per-item AND global discount (main test case)"""
        # Item A: 10 qty × 50 cost × 1.6 margin = 800, then -5€ = 795
        # Item B: 5 qty × 100 cost × 1.5 margin = 750, then -10% = 675
        # Subtotal = 795 + 675 = 1470
        # Global 10% discount: 1470 * 0.9 = 1323
        payload = {
            "title": f"TEST_CombinedDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Combined_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item A",
                    "quantity": 10,
                    "unit_cost": 50.0,
                    "margin": 0.6,
                    "discount_type": "value",
                    "discount_value": 5.0
                },
                {
                    "category": "Servico",
                    "name": "Item B",
                    "quantity": 5,
                    "unit_cost": 100.0,
                    "margin": 0.5,
                    "discount_type": "percentage",
                    "discount_value": 10.0
                }
            ],
            "discount_type": "percentage",
            "discount_value": 10.0,
            "payment_methods": ["Transferencia Bancaria", "MB Way"],
            "payment_split": "50% no inicio dos trabalhos, 50% na conclusao"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify the exact calculation from the problem statement
        assert data["total_price"] == 1323.0, f"Expected 1323.0, got {data['total_price']}"
        
        # Verify discount fields are stored
        assert data["discount_type"] == "percentage"
        assert data["discount_value"] == 10.0
        
        # Verify payment fields are stored
        assert data["payment_methods"] == ["Transferencia Bancaria", "MB Way"]
        assert data["payment_split"] == "50% no inicio dos trabalhos, 50% na conclusao"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")


class TestBudgetPaymentFields:
    """Tests for payment methods, split, and notes fields"""
    
    def test_budget_with_all_payment_fields(self, auth_session):
        """Test budget creation with all payment fields"""
        payload = {
            "title": f"TEST_PaymentFields_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Payment_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 100, "margin": 0.5}],
            "payment_methods": ["Transferencia Bancaria", "MB Way", "Multibanco"],
            "payment_split": "30% no inicio, 40% a meio, 30% na conclusao",
            "payment_notes": "Prazo de pagamento a 30 dias apos fatura"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify all payment fields
        assert data["payment_methods"] == ["Transferencia Bancaria", "MB Way", "Multibanco"]
        assert data["payment_split"] == "30% no inicio, 40% a meio, 30% na conclusao"
        assert data["payment_notes"] == "Prazo de pagamento a 30 dias apos fatura"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")
    
    def test_budget_update_payment_fields(self, auth_session):
        """Test updating payment fields on existing budget"""
        # Create budget
        create_payload = {
            "title": f"TEST_UpdatePayment_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Update_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 100, "margin": 0.5}],
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "100% na conclusao"
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=create_payload)
        assert create_resp.status_code == 200
        budget = create_resp.json()
        budget_id = budget["id"]
        
        # Update payment fields
        update_payload = {
            "payment_methods": ["MB Way", "Numerario"],
            "payment_split": "50% no inicio, 50% na conclusao",
            "payment_notes": "Updated payment notes"
        }
        update_resp = auth_session.put(f"{BASE_URL}/api/budgets/{budget_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        # Verify updates
        assert updated["payment_methods"] == ["MB Way", "Numerario"]
        assert updated["payment_split"] == "50% no inicio, 50% na conclusao"
        assert updated["payment_notes"] == "Updated payment notes"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")


class TestBudgetUpdateWithDiscount:
    """Tests for updating budgets with discount recalculation"""
    
    def test_update_budget_items_recalculates_total(self, auth_session):
        """Test that updating items recalculates total with discounts"""
        # Create budget with discount
        create_payload = {
            "title": f"TEST_UpdateItems_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Update_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 100, "margin": 0.5}],
            "discount_type": "percentage",
            "discount_value": 10.0,
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "100% na conclusao"
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=create_payload)
        assert create_resp.status_code == 200
        budget = create_resp.json()
        budget_id = budget["id"]
        
        # Initial: 1 * 100 * 1.5 = 150, then -10% = 135
        assert budget["total_price"] == 135.0
        
        # Update items (double quantity)
        update_payload = {
            "items": [{"category": "Test", "name": "Item", "quantity": 2, "unit_cost": 100, "margin": 0.5}]
        }
        update_resp = auth_session.put(f"{BASE_URL}/api/budgets/{budget_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        # New: 2 * 100 * 1.5 = 300, then -10% = 270
        assert updated["total_price"] == 270.0, f"Expected 270.0, got {updated['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")
    
    def test_update_discount_recalculates_total(self, auth_session):
        """Test that updating discount recalculates total"""
        # Create budget without discount
        create_payload = {
            "title": f"TEST_UpdateDiscount_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Update_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 10, "unit_cost": 100, "margin": 0.5}],
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "100% na conclusao"
        }
        create_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=create_payload)
        assert create_resp.status_code == 200
        budget = create_resp.json()
        budget_id = budget["id"]
        
        # Initial: 10 * 100 * 1.5 = 1500
        assert budget["total_price"] == 1500.0
        
        # Add 20% discount
        update_payload = {
            "discount_type": "percentage",
            "discount_value": 20.0
        }
        update_resp = auth_session.put(f"{BASE_URL}/api/budgets/{budget_id}", json=update_payload)
        assert update_resp.status_code == 200
        updated = update_resp.json()
        
        # New: 1500 * 0.8 = 1200
        assert updated["total_price"] == 1200.0, f"Expected 1200.0, got {updated['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")


class TestProposalPaymentPropagation:
    """Tests for payment fields propagation from budget to proposals"""
    
    def test_proposals_inherit_payment_fields(self, auth_session):
        """Test that generated proposals inherit payment fields from budget"""
        # Create budget with payment fields
        budget_payload = {
            "title": f"TEST_ProposalPayment_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Proposal_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 1000, "margin": 0.5}],
            "discount_type": "percentage",
            "discount_value": 5.0,
            "payment_methods": ["Transferencia Bancaria", "MB Way", "Cheque"],
            "payment_split": "40% no inicio, 60% na entrega",
            "payment_notes": "IVA nao incluido"
        }
        budget_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=budget_payload)
        assert budget_resp.status_code == 200
        budget = budget_resp.json()
        budget_id = budget["id"]
        
        # Generate proposals
        gen_resp = auth_session.post(f"{BASE_URL}/api/budgets/{budget_id}/generate-proposals")
        assert gen_resp.status_code == 200
        proposals = gen_resp.json()
        
        # Verify all 3 proposals have the payment fields
        assert len(proposals) == 3
        for p in proposals:
            assert p["payment_methods"] == ["Transferencia Bancaria", "MB Way", "Cheque"], f"Proposal {p['tier']} missing payment_methods"
            assert p["payment_split"] == "40% no inicio, 60% na entrega", f"Proposal {p['tier']} missing payment_split"
            assert p["payment_notes"] == "IVA nao incluido", f"Proposal {p['tier']} missing payment_notes"
            assert p["discount_type"] == "percentage", f"Proposal {p['tier']} missing discount_type"
            assert p["discount_value"] == 5.0, f"Proposal {p['tier']} missing discount_value"
        
        # Cleanup
        for p in proposals:
            auth_session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")
    
    def test_proposals_have_correct_final_values(self, auth_session):
        """Test that proposals have correct final values with discount applied"""
        # Create budget with discount
        budget_payload = {
            "title": f"TEST_ProposalValues_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_Values_Cliente",
            "items": [{"category": "Test", "name": "Item", "quantity": 1, "unit_cost": 1000, "margin": 0.6}],
            "discount_type": "percentage",
            "discount_value": 10.0,
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "100% na conclusao"
        }
        budget_resp = auth_session.post(f"{BASE_URL}/api/budgets", json=budget_payload)
        assert budget_resp.status_code == 200
        budget = budget_resp.json()
        budget_id = budget["id"]
        
        # Budget total: 1000 * 1.6 = 1600, then -10% = 1440
        assert budget["total_price"] == 1440.0
        
        # Generate proposals
        gen_resp = auth_session.post(f"{BASE_URL}/api/budgets/{budget_id}/generate-proposals")
        assert gen_resp.status_code == 200
        proposals = gen_resp.json()
        
        # Verify proposal values (based on discounted budget total)
        for p in proposals:
            if p["tier"] == "basico":
                assert p["final_value"] == 1440.0, f"Basico expected 1440.0, got {p['final_value']}"
            elif p["tier"] == "profissional":
                expected = round(1440.0 * 1.15, 2)
                assert p["final_value"] == expected, f"Profissional expected {expected}, got {p['final_value']}"
            elif p["tier"] == "premium":
                expected = round(1440.0 * 1.30, 2)
                assert p["final_value"] == expected, f"Premium expected {expected}, got {p['final_value']}"
        
        # Cleanup
        for p in proposals:
            auth_session.delete(f"{BASE_URL}/api/proposals/{p['id']}")
        auth_session.delete(f"{BASE_URL}/api/budgets/{budget_id}")


class TestBudgetItemDiscountFields:
    """Tests for per-item discount fields in budget items"""
    
    def test_item_discount_fields_stored(self, auth_session):
        """Test that per-item discount fields are stored correctly"""
        payload = {
            "title": f"TEST_ItemDiscountFields_{uuid.uuid4().hex[:8]}",
            "client_name": "TEST_ItemDiscount_Cliente",
            "items": [
                {
                    "category": "Material",
                    "name": "Item with value discount",
                    "quantity": 5,
                    "unit_cost": 100.0,
                    "margin": 0.5,
                    "discount_type": "value",
                    "discount_value": 25.0
                },
                {
                    "category": "Servico",
                    "name": "Item with percentage discount",
                    "quantity": 3,
                    "unit_cost": 200.0,
                    "margin": 0.6,
                    "discount_type": "percentage",
                    "discount_value": 15.0
                }
            ],
            "payment_methods": ["Transferencia Bancaria"],
            "payment_split": "100% na conclusao"
        }
        response = auth_session.post(f"{BASE_URL}/api/budgets", json=payload)
        assert response.status_code == 200, f"Create budget failed: {response.text}"
        data = response.json()
        
        # Verify item discount fields are stored
        assert len(data["items"]) == 2
        
        item1 = data["items"][0]
        assert item1["discount_type"] == "value"
        assert item1["discount_value"] == 25.0
        
        item2 = data["items"][1]
        assert item2["discount_type"] == "percentage"
        assert item2["discount_value"] == 15.0
        
        # Verify calculation:
        # Item 1: 5 * 100 * 1.5 = 750, then -25 = 725
        # Item 2: 3 * 200 * 1.6 = 960, then -15% = 816
        # Total: 725 + 816 = 1541
        assert data["total_price"] == 1541.0, f"Expected 1541.0, got {data['total_price']}"
        
        # Cleanup
        auth_session.delete(f"{BASE_URL}/api/budgets/{data['id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
