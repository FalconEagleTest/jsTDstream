import requests
import time
import json
import os

class TelegramFileClient:
    def __init__(self, base_url="http://localhost:8000"):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()

    def check_status(self):
        """Check server and authentication status"""
        try:
            response = self.session.get(f"{self.base_url}/auth/status")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error checking status: {e}")
            return None

    def setup_api(self, api_id, api_hash):
        """Setup the Telegram API credentials"""
        response = self.session.post(
            f"{self.base_url}/auth/setup",
            json={"apiId": api_id, "apiHash": api_hash}
        )
        response.raise_for_status()
        return response.json()

    def send_code(self, phone_number):
        """Send verification code to phone number"""
        response = self.session.post(
            f"{self.base_url}/auth/send-code",
            json={"phoneNumber": phone_number}
        )
        response.raise_for_status()
        return response.json()

    def verify_code(self, code):
        """Verify the received authentication code"""
        response = self.session.post(
            f"{self.base_url}/auth/verify-code",
            json={"code": code}
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get("needsPassword"):
            return {"needs_password": True, "hint": result.get("hint")}
        return result

    def verify_password(self, password):
        """Verify 2FA password if needed"""
        response = self.session.post(
            f"{self.base_url}/auth/verify-password",
            json={"password": password}
        )
        response.raise_for_status()
        return response.json()

    def get_groups(self):
        """Get list of available groups"""
        response = self.session.get(f"{self.base_url}/groups")
        response.raise_for_status()
        return response.json()
    def check_file_access(self, file_id):
        """Test access to a file's stream"""
        url = f"{self.base_url}/files/{file_id}/stream"
        print(f"Testing access to: {url}")
        
        try:
            # Just check headers
            response = self.session.head(url)
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            return response.status_code == 200
        except Exception as e:
            print(f"Error checking file access: {e}")
            return False
    def get_group_files(self, group_id):
        """Get list of files in a specific group"""
        try:
            url = f"{self.base_url}/files/group/{group_id}"
            print(f"Requesting: {url}")
            
            response = self.session.get(url)
            print(f"Response status: {response.status_code}")
            
            if response.status_code != 200:
                print(f"Response content: {response.text}")
                response.raise_for_status()
                
            data = response.json()
            print(f"Found {len(data.get('files', []))} files")
            return data.get('files', [])
        except Exception as e:
            print(f"Error getting group files: {e}")
            raise

    def get_stream_url(self, file_id, group_id=None):
        """Generate streaming URL for a file"""
        # Add group context if available
        if group_id:
            return f"{self.base_url}/files/group/{group_id}/file/{file_id}/stream"
        return f"{self.base_url}/files/{file_id}/stream"

def format_file_info(file, base_url, group_id=None):
    """Format file information into a consistent structure"""
    size_mb = int(file.get('size', 0)) / (1024 * 1024)
    file_id = file.get('id')
    
    if group_id:
        stream_url = f"{base_url}/files/{file_id}/stream?groupId={group_id}"
        download_url = f"{base_url}/files/{file_id}/download?groupId={group_id}"
    else:
        stream_url = f"{base_url}/files/{file_id}/stream"
        download_url = f"{base_url}/files/{file_id}/download"
    return {
        "id": file_id,
        "name": file.get('name', 'Unnamed'),
        "size": {
            "bytes": file.get('size', 0),
            "megabytes": round(size_mb, 2)
        },
        "media_info": {
            "duration_seconds": file.get('duration', 0),
            "width": file.get('width', 0),
            "height": file.get('height', 0),
            "mime_type": file.get('mime', '')
        },
        "urls": {
            "stream": stream_url,
            "download": download_url
        }
    }

def save_json_output(data, filename):
    """Save data to a JSON file with proper formatting"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    # Initialize client
    client = TelegramFileClient()
    output_data = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "server": client.base_url,
        "groups": []
    }

    try:
        # Check server status
        print("Checking server status...")
        status = client.check_status()
        if status is None:
            print("Error: Could not connect to server. Make sure the server is running.")
            return
        
        output_data["server_status"] = status
        print(f"Server status: {status}")

        # Setup API credentials if needed
        if not status.get('setup'):
            print("\nSetting up API credentials...")
            api_id = input("Enter API ID: ")
            api_hash = input("Enter API Hash: ")
            client.setup_api(api_id, api_hash)
        else:
            print("\nAPI credentials already configured.")

        # Authentication if needed
        if not status.get('isAuthenticated'):
            print("\nStarting authentication...")
            phone = input("Enter phone number (with country code): ")
            send_result = client.send_code(phone)
            print("Verification code sent!")

            code = input("Enter the verification code received: ")
            verify_result = client.verify_code(code)

            if verify_result.get("needs_password"):
                print(f"\n2FA is enabled. Hint: {verify_result.get('hint')}")
                password = input("Enter your 2FA password: ")
                verify_result = client.verify_password(password)

            print("\nAuthentication successful!")
        else:
            print("\nAlready authenticated.")

        # Get groups
        print("\nFetching groups...")
        groups = client.get_groups()
        print("\nAvailable Groups:")
        for i, group in enumerate(groups, 1):
            print(f"{i}. {group['name']} (ID: {group['id']})")

        # Get files from selected group
        group_choice = int(input("\nEnter the number of the group to list files from: ")) - 1
        if 0 <= group_choice < len(groups):
            selected_group = groups[group_choice]
            print(f"\nFetching files from {selected_group['name']}...")
            
            # Prepare group data
            group_data = {
                "id": selected_group['id'],
                "name": selected_group['name'],
                "type": selected_group.get('type', 'group'),
                "files": []
            }

            files = client.get_group_files(selected_group['id'])
            if not files:
                print("No files found in this group.")
            else:
                print(f"\nFound {len(files)} files.")
                for file in files:
                    group_data["files"].append(
                        format_file_info(file, client.base_url,selected_group['id'])
                    )

            output_data["groups"].append(group_data)
            
            # Save to JSON file
            filename = f"telegram_files_{time.strftime('%Y%m%d_%H%M%S')}.json"
            save_json_output(output_data, filename)
            print(f"\nData saved to {filename}")

            # Print summary
            print("\nFiles in group:")
            for file in group_data["files"]:
                print(f"\nName: {file['name']}")
                print(f"Size: {file['size']['megabytes']} MB")
                print(f"Duration: {file['media_info']['duration_seconds']} seconds")
                print(f"Resolution: {file['media_info']['width']}x{file['media_info']['height']}")
                print(f"Stream URL: {file['urls']['stream']}")

    except requests.exceptions.RequestException as e:
        print(f"Error communicating with server: {e}")
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()