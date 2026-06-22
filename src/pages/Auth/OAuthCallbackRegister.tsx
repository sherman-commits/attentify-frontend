import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { useCompany } from "../../context/CompanyContext";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const OAuthCallbackRegister = () => {
  const navigate = useNavigate();
  const { setUser } = useUser();
  const { setCompanies, setCurrentCompanyId } = useCompany();

  useEffect(() => {
    const fetchAuth = async () => {
      try {
        const response = await axios.get(`${API_URL}/auth/me`, {
          withCredentials: true,
        });
        const data = response.data;

        // Store token in localStorage for subsequent API calls via Authorization header
        const token = data.token;
        if (token) {
          localStorage.setItem("token", token);
        }

        const user = data.user;
        localStorage.setItem("user", JSON.stringify(user));
        setUser(user);

        if (user.companies?.length) {
          setCompanies(user.companies);
          setCurrentCompanyId(user.company_id || "");
        }

        setTimeout(() => {
          navigate(data.redirect_url || "/login");
        }, 500);
      } catch {
        navigate("/login");
      }
    };

    fetchAuth();
  }, [navigate, setUser, setCompanies, setCurrentCompanyId]);

  return <p>Loading...</p>;
};

export default OAuthCallbackRegister;
