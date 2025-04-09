import subprocess
import os

def install_requirements():
    # Directory of the current script + relative path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, './requirements.txt')

    try:
        # Open and read each line from the requirements.txt file
        with open(file_path, 'r') as file:
            for line in file:
                package = line.strip()  # Remove any surrounding whitespace
                if package:  # Check if the line is not empty
                    print(f"Installing {package}...")
                    subprocess.check_call(['pip', 'install', package])
                    print(f"{package} installed successfully.")
    except FileNotFoundError:
        print(f"The file '{file_path}' was not found.")
    except subprocess.CalledProcessError:
        print(f"An error occurred while installing {package}.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

# Run the function
install_requirements()
